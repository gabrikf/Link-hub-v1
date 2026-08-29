#!/usr/bin/env node
/**
 * Scenario runner for the `visual-check` skill.
 *
 * WHY THIS EXISTS: driving a browser one agent tool call per action costs a
 * model round-trip plus a page snapshot PER ACTION. Checking one screen in its
 * four states — loading, empty, error, filled — is 15-30 actions, so the LOOP
 * SHAPE, not the browser, is what makes visual checking slow. A scenario is
 * that same check written as one file and executed in ONE process: one browser
 * launch, one session, every state visited back to back.
 *
 * Usage:
 *   node scripts/visual/run.mjs scripts/visual/scenarios/public-profile.scenario.mjs
 *   npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
 *   npm run visual:run -- <file> --headed        # watch it happen
 *
 * A scenario is plain Playwright. It default-exports one async function and
 * receives the context built by `createScenarioContext` below:
 *
 *   export const requiresAuth = true;            // default false
 *   export default async function ({ goto, shot, mock, assert, page }) {
 *     await goto('/dashboard');
 *     await shot('filled');
 *     await mock(POSTS, { body: [] });           // force the empty state
 *     await goto('/dashboard');
 *     await shot('empty');
 *     assert(await page.getByText('No posts yet').isVisible(), 'empty state renders');
 *   }
 *
 * `requiresAuth` exists because CraftHub genuinely has public pages —
 * `/profile/$username` is the shareable artifact the whole product is for. A
 * runner that demanded a session for every capture could not check the one page
 * that matters most.
 *
 * Everything that makes a capture comparable — viewport, storageState, origin
 * allow/block lists, testIdAttribute, output directory — comes from
 * `.playwright/cli.config.json`. There is exactly one contract.
 *
 * This script NEVER handles credentials. It only consumes the session
 * `scripts/visual/session.mjs` produced.
 */
import { chromium, selectors } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const CONFIG_PATH = resolve(ROOT, ".playwright/cli.config.json");
const STATE_PATH = resolve(ROOT, ".playwright/auth.json");
const APP_URL = process.env.VISUAL_APP_URL || "http://localhost:5173";
const API_URL = process.env.VISUAL_API_URL || "http://localhost:3333";

/**
 * The allowlist in cli.config.json names localhost:5173 and localhost:3333
 * literally. That is fine until the app runs anywhere else — another project on
 * this machine owning 5173/3333 is common — at which point `interceptOrigins`
 * aborts EVERY request, including the app's own, and the scenario reports a
 * blank page rather than a port mismatch. The app under test can never be the
 * thing the allowlist blocks, so its origins are always injected.
 */
function withAppOrigins(network = {}) {
  if (!network.allowedOrigins?.length) return network;
  const hosts = [APP_URL, API_URL].map((url) => new URL(url).host);
  const allowedOrigins = [...new Set([...network.allowedOrigins, ...hosts])];
  return { ...network, allowedOrigins };
}

/** Where the app lands when the session is dead. `/` is the auth page here. */
const LOGIN_PATH = /^\/$|login|signin|auth/i;

/** Agent iteration wants fail-fast, not patience. */
const ACTION_TIMEOUT = 3_000;
const NAVIGATION_TIMEOUT = 15_000;

/** Safety margin for a login redirect to land after `load`. See `assertLiveSession`. */
const SESSION_PROBE_MARGIN = 400;

/* ────────────────────────────── origins ────────────────────────────────── */

function originOrHostGlob(originOrHost) {
  const wildcardPortMatch = originOrHost.match(/^(https?:\/\/[^/:]+):\*$/);
  if (wildcardPortMatch) return `${wildcardPortMatch[1]}:*/**`;
  try {
    const url = new URL(originOrHost);
    if (url.origin !== "null") return `${url.origin}/**`;
  } catch {
    // not a full origin — fall through to the host form
  }
  return `*://${originOrHost}/**`;
}

/**
 * Catch-all abort first, then one `continue` per allowed origin, then one
 * `abort` per blocked origin. Playwright matches the LAST registered route
 * first, so blocked beats allowed, and anything the allowlist does not name
 * never leaves the browser. That keeps a capture from depending on Sentry or a
 * CDN being up.
 */
async function interceptOrigins(context, rawNetwork = {}) {
  const network = withAppOrigins(rawNetwork);
  if (network.allowedOrigins?.length) {
    await context.route("**", (route) => route.abort("blockedbyclient"));
    for (const origin of network.allowedOrigins) {
      await context.route(originOrHostGlob(origin), (route) => route.continue());
    }
  }
  for (const origin of network.blockedOrigins || []) {
    await context.route(originOrHostGlob(origin), (route) =>
      route.abort("blockedbyclient"),
    );
  }
}

/** `*` matches anything but `/`, like a Playwright URL glob. Used for REPORTING. */
function hostMatches(pattern, value) {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${source}$`, "i").test(value);
}

/** True when `url` belongs to an origin we deliberately blocked (telemetry). */
function isBlockedOrigin(url, blockedOrigins = []) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  const hostPort = parsed.port ? `${host}:${parsed.port}` : host;
  return blockedOrigins.some((origin) => {
    const bare = origin
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\*$/, "");
    return hostMatches(bare, host) || hostMatches(bare, hostPort);
  });
}

/* ───────────────────────────── collectors ──────────────────────────────── */

/**
 * The console + network gate, wired at launch so every run reports it whether
 * or not the scenario remembered to ask.
 */
function createCollectors(blockedOrigins) {
  const consoleErrors = [];
  const consoleWarnings = [];
  const badRequests = [];
  const expected = [];

  /**
   * While a scenario is deliberately making an endpoint fail, the errors that
   * follow are the POINT of the capture, not a defect — a 500 mock exists
   * precisely to render the error state. `gate.failing` counts the active
   * failing mocks; anything collected inside that window is reported separately
   * and does not fail the run. Outside it, an error is still an error.
   */
  const gate = { failing: 0 };

  const ignorable = (url, text = "") =>
    isBlockedOrigin(url, blockedOrigins) || /ERR_BLOCKED_BY_CLIENT/i.test(text);

  function attach(page, label) {
    const where = label ? `[${label}] ` : "";

    page.on("console", (message) => {
      const type = message.type();
      if (type !== "error" && type !== "warning") return;
      const url = message.location()?.url || "";
      const text = message.text();
      if (ignorable(url, text)) return;
      if (type === "error" && gate.failing > 0) {
        expected.push(`${where}console: ${text}`);
        return;
      }
      (type === "error" ? consoleErrors : consoleWarnings).push(`${where}${text}`);
    });

    // An UNCAUGHT exception is never excused by a failing mock. A 500 the screen
    // does not survive is the white-screen bug — mocking the 500 is how you FIND
    // it, not a pardon for it.
    page.on("pageerror", (error) => {
      consoleErrors.push(`${where}[uncaught] ${error.message}`);
    });

    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText || "failed";
      if (ignorable(request.url(), failure)) return;
      const entry = `${where}${failure} ${request.method()} ${request.url()}`;
      (gate.failing > 0 ? expected : badRequests).push(entry);
    });

    page.on("response", (response) => {
      if (response.status() < 400) return;
      if (ignorable(response.url())) return;
      const entry = `${where}${response.status()} ${response.request().method()} ${response.url()}`;
      (gate.failing > 0 ? expected : badRequests).push(entry);
    });
  }

  return { attach, gate, consoleErrors, consoleWarnings, badRequests, expected };
}

/* ─────────────────────────── scenario context ──────────────────────────── */

function createScenarioContext({
  browser,
  context,
  page,
  collectors,
  scenarioName,
  outputDir,
  newContext,
  requiresAuth,
}) {
  const screenshots = [];
  const assertions = [];
  const mocks = [];

  const absolute = (pathOrUrl) =>
    /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : `${APP_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  /** Screenshots always land in `outputDir`, never in the repo root. */
  async function shot(name, options = {}) {
    const { target, ...rest } = options;
    const safe = basename(String(name)).replace(/\.png$/i, "");
    const file = resolve(outputDir, `${scenarioName}-${safe}.png`);
    await (target ?? page).screenshot({ path: file, ...rest });
    screenshots.push(file);
    return file;
  }

  /**
   * Fulfil a URL pattern with a body or a status. `delay` holds the response
   * open — that is how the LOADING state is captured; `delay: Infinity` never
   * answers at all, so the loading branch stays on screen for the screenshot.
   */
  async function mock(
    pattern,
    { body, status = 200, contentType, headers, delay = 0 } = {},
  ) {
    const isObject = body !== undefined && typeof body !== "string";
    const deliberatelyFailing = status >= 400 || delay === Infinity;
    if (deliberatelyFailing) collectors.gate.failing += 1;
    const handler = async (route) => {
      if (delay === Infinity) return new Promise(() => {});
      if (delay > 0) await new Promise((done) => setTimeout(done, delay));
      return route.fulfill({
        status,
        contentType: contentType ?? (isObject ? "application/json" : undefined),
        headers,
        body: body === undefined ? undefined : isObject ? JSON.stringify(body) : body,
      });
    };
    await context.route(pattern, handler);
    mocks.push({ pattern, handler, deliberatelyFailing });
    return handler;
  }

  async function unmock(pattern) {
    const doomed = pattern ? mocks.filter((m) => m.pattern === pattern) : [...mocks];
    for (const { pattern: p, handler, deliberatelyFailing } of doomed) {
      await context.unroute(p, handler);
      if (deliberatelyFailing) collectors.gate.failing -= 1;
    }
    mocks.splice(0, mocks.length, ...mocks.filter((m) => !doomed.includes(m)));
    return doomed.length;
  }

  /** Accumulates instead of throwing, so one bad state does not hide the other three. */
  function assert(condition, label) {
    const ok = Boolean(condition);
    assertions.push({ ok, label });
    if (!ok) console.log(`  ✗ ${label}`);
    return ok;
  }

  /**
   * The first navigation doubles as the session check for authed scenarios:
   * a scenario that silently ran against the auth page proves nothing, and a
   * dedicated probe navigation would cost a full extra SPA boot to learn the
   * same thing.
   */
  const session = { verified: !requiresAuth };
  async function goto(pathOrUrl, options) {
    const response = await page.goto(absolute(pathOrUrl), {
      waitUntil: "load",
      ...options,
    });
    if (requiresAuth && !session.verified) {
      await assertLiveSession(page);
      session.verified = true;
    }
    return response;
  }

  async function resize(width, height, target = page) {
    return target.setViewportSize({ width, height });
  }

  /**
   * Sets the stored theme preference and reloads.
   *
   * Deliberately NOT `documentElement.classList.add('dark')`: forcing the class
   * bypasses `applyTheme` in apps/web/src/lib/theme.ts, so a broken theme
   * bootstrap would still screenshot as a perfectly good dark page. Going
   * through localStorage exercises the real path.
   */
  async function setTheme(theme, target = page) {
    await target.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      ["crafthub-theme", theme],
    );
    await target.reload({ waitUntil: "load" });
  }

  /** Extra context+page for logged-out / second-user checks. Closed with the run. */
  async function newUserPage(overrides = {}) {
    return newContext(overrides);
  }

  const log = (message) => console.log(`  · ${message}`);

  return {
    ctx: {
      browser,
      context,
      page,
      appUrl: APP_URL,
      goto,
      shot,
      mock,
      unmock,
      assert,
      resize,
      setTheme,
      newUserPage,
      log,
      collectors,
    },
    screenshots,
    assertions,
    session,
  };
}

/* ────────────────────────────── the session ────────────────────────────── */

/** Thrown when the app bounces to the auth page. Carries the guidance. */
class DeadSessionError extends Error {}

/** Cheap half of the check: no cookies AND no localStorage means no session. */
function checkStoredSession() {
  if (!existsSync(STATE_PATH)) {
    return "❌ No saved session. Run: npm run visual:login";
  }
  const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const hasCookies = (state.cookies || []).length > 0;
  // CraftHub keeps its JWTs in localStorage under `crafthub.auth.tokens`, not in
  // a cookie, so a cookies-only check would report every valid session as dead.
  const hasOrigins = (state.origins || []).some(
    (origin) => (origin.localStorage || []).length > 0,
  );
  if (!hasCookies && !hasOrigins) {
    return "❌ No saved session. Run: npm run visual:login";
  }
  return null;
}

/**
 * Expensive half: the app, once loaded, must NOT be sitting on the auth route.
 * Checking "a token exists" would lie — an expired JWT still exists.
 */
async function assertLiveSession(page) {
  const bounced = await page
    .waitForFunction(() => /^\/$|login|signin|auth/i.test(location.pathname), {
      timeout: SESSION_PROBE_MARGIN,
    })
    .then(() => true)
    .catch(() => false);

  const path = await page.evaluate(() => location.pathname);
  if (bounced || LOGIN_PATH.test(path)) {
    throw new DeadSessionError(
      `❌ Session expired (the app landed on "${path}"). Run: npm run visual:login`,
    );
  }
}

/* ──────────────────────────────── summary ──────────────────────────────── */

function printSummary({
  scenarioName,
  assertions,
  collectors,
  screenshots,
  elapsedMs,
  crash,
  outputDir,
}) {
  const failed = assertions.filter((a) => !a.ok);
  const { consoleErrors, consoleWarnings, badRequests, expected } = collectors;

  const detail = (title, items) => {
    if (!items.length) return;
    console.log(`\n${title}`);
    for (const item of items.slice(0, 20)) console.log(`  - ${item}`);
    if (items.length > 20) console.log(`  … +${items.length - 20} more`);
  };

  detail("Console errors", consoleErrors);
  detail("Console warnings", consoleWarnings);
  detail("Bad requests", badRequests);
  detail("Expected (a failing mock was active — not a defect)", expected);
  if (failed.length) detail("Failed assertions", failed.map((a) => a.label));

  const ok =
    !crash && failed.length === 0 && consoleErrors.length === 0 && badRequests.length === 0;

  console.log(
    `\n── visual-check · ${scenarioName} ${"─".repeat(Math.max(0, 42 - scenarioName.length))}`,
  );
  console.log(
    `  assertions   ${assertions.length - failed.length} passed, ${failed.length} failed`,
  );
  console.log(
    `  console      ${consoleErrors.length} errors, ${consoleWarnings.length} warnings`,
  );
  console.log(`  network      ${badRequests.length} bad requests`);
  console.log(`  expected     ${expected.length} (from deliberate 4xx/5xx mocks)`);
  console.log(
    `  screenshots  ${screenshots.length} → ${outputDir.replace(`${ROOT}/`, "")}/${scenarioName}-*.png`,
  );
  console.log(`  time         ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(ok ? "✅ PASS" : "❌ FAIL");

  return ok ? 0 : 1;
}

/* ──────────────────────────────── runner ───────────────────────────────── */

async function main() {
  const startedAt = Date.now();
  const argv = process.argv.slice(2);
  const headed = argv.includes("--headed") || process.env.HEADED === "1";
  const target = argv.find((arg) => !arg.startsWith("--"));

  if (!target) {
    console.error("Usage: node scripts/visual/run.mjs <scenario.mjs> [--headed]");
    return 64;
  }

  const scenarioPath = resolve(process.cwd(), target);
  if (!existsSync(scenarioPath)) {
    console.error(`❌ Scenario not found: ${scenarioPath}`);
    return 66;
  }
  const scenarioName = basename(scenarioPath, extname(scenarioPath)).replace(
    /\.scenario$/,
    "",
  );

  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const contextOptions = { ...(config.browser?.contextOptions || {}) };
  const outputDir = resolve(ROOT, config.outputDir || ".visual");
  mkdirSync(outputDir, { recursive: true });

  if (config.testIdAttribute) selectors.setTestIdAttribute(config.testIdAttribute);

  const module = await import(pathToFileURL(scenarioPath).href);
  const run = module.default ?? module.run;
  if (typeof run !== "function") {
    console.error(
      `❌ ${target} must export a function (export default async ({ page }) => …).`,
    );
    return 64;
  }
  const requiresAuth = module.requiresAuth === true;

  if (requiresAuth) {
    const noSession = checkStoredSession();
    if (noSession) {
      console.error(noSession);
      return 1;
    }
    if (typeof contextOptions.storageState === "string") {
      contextOptions.storageState = resolve(ROOT, contextOptions.storageState);
    }
  } else {
    // A public page must be captured as a stranger sees it. Reusing a signed-in
    // session here is how "it looks fine" gets reported for a page that is in
    // fact broken for everyone who is not the author.
    delete contextOptions.storageState;
  }

  const blockedOrigins = config.network?.blockedOrigins || [];
  const collectors = createCollectors(blockedOrigins);
  const extraContexts = [];

  const browser = await chromium.launch({
    ...(config.browser?.launchOptions || {}),
    headless: !headed,
  });

  let crash = null;
  let deadSession = false;
  let assertions = [];
  let screenshots = [];

  try {
    const context = await browser.newContext(contextOptions);
    context.setDefaultTimeout(ACTION_TIMEOUT);
    context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
    await interceptOrigins(context, config.network);

    const page = await context.newPage();
    collectors.attach(page);

    const newContext = async (overrides = {}) => {
      const extra = await browser.newContext({ ...contextOptions, ...overrides });
      extra.setDefaultTimeout(ACTION_TIMEOUT);
      extra.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
      await interceptOrigins(extra, config.network);
      const extraPage = await extra.newPage();
      collectors.attach(extraPage, `page${extraContexts.length + 2}`);
      extraContexts.push(extra);
      return { context: extra, page: extraPage };
    };

    const built = createScenarioContext({
      browser,
      context,
      page,
      collectors,
      scenarioName,
      outputDir,
      newContext,
      requiresAuth,
    });
    assertions = built.assertions;
    screenshots = built.screenshots;

    await run(built.ctx);

    // An authed scenario that never navigated never proved the session is
    // alive. Say so instead of reporting a green run nobody can trust.
    if (!built.session.verified) {
      console.error(
        "⚠️  The scenario never navigated — the session was not verified. Use `goto()`.",
      );
      crash = new Error("session never verified");
    }
  } catch (error) {
    if (error instanceof DeadSessionError) {
      console.error(error.message);
      deadSession = true;
    } else {
      crash = error;
      console.error(`\n❌ The scenario threw: ${error?.stack || error}`);
    }
  } finally {
    for (const extra of extraContexts) await extra.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  if (deadSession) return 1;

  return printSummary({
    scenarioName,
    assertions,
    collectors,
    screenshots,
    elapsedMs: Date.now() - startedAt,
    crash,
    outputDir,
  });
}

process.exit((await main()) ?? 0);
