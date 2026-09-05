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
 * `/$username` is the shareable artifact the whole product is for. A
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

/* ──────────────────────────────── theme ────────────────────────────────── */

/** `apps/web/src/lib/theme.ts`. A preference (`light`/`dark`/`system`). */
const THEME_STORAGE_KEY = "crafthub-theme";

/** The endpoint `app-boot.ts` reads the signed-in account's preferences from. */
const PREFERENCES_ROUTE = "**/preferences";

/** How long `setTheme` waits for boot to finish painting before it complains. */
const THEME_SETTLE_MS = 4_000;

/**
 * And how long it then keeps watching. `app-boot` applies the account's stored
 * preference AFTER `load`, so a check that fires the instant `.dark` appears
 * can pass and be wrong 200ms later — which is the exact shape of the bug this
 * assertion exists to catch.
 */
const THEME_HOLD_MS = 400;

/**
 * Reads what is ACTUALLY painted, plus what the preference should resolve to.
 *
 * `"system"` is resolved in the page rather than by the runner, because the OS
 * preference the browser reports (possibly emulated by `emulateMedia`) is the
 * only one that counts.
 */
const paintedThemeProbe = (preference) => {
  const root = document.documentElement;
  const expected =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  return {
    expected,
    painted: root.classList.contains("dark") ? "dark" : "light",
    colorScheme: root.style.colorScheme,
    background: window.getComputedStyle(document.body).backgroundColor,
  };
};

/**
 * `**` spans path separators, `*` does not — Playwright's URL glob semantics,
 * reimplemented because `mock()` records its patterns as strings and the
 * `/preferences` rewriter has to know whether one of them already owns this
 * request.
 */
function globToRegExp(pattern) {
  // One pass, with `**` first in the alternation, so a `**` is never re-read as
  // two single `*`s.
  const source = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*|\*/g, (star) => (star === "**" ? ".*" : "[^/]*"));
  return new RegExp(`^${source}$`);
}

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
      await context.route(originOrHostGlob(origin), (route) =>
        route.continue(),
      );
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
      (type === "error" ? consoleErrors : consoleWarnings).push(
        `${where}${text}`,
      );
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

  return {
    attach,
    gate,
    consoleErrors,
    consoleWarnings,
    badRequests,
    expected,
  };
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
        body:
          body === undefined
            ? undefined
            : isObject
              ? JSON.stringify(body)
              : body,
      });
    };
    await context.route(pattern, handler);
    // `body` is recorded, not only closed over, so the `/preferences` rewriter
    // can re-theme a scenario's own preferences mock instead of replacing it.
    mocks.push({ pattern, handler, deliberatelyFailing, body });
    return handler;
  }

  async function unmock(pattern) {
    const doomed = pattern
      ? mocks.filter((m) => m.pattern === pattern)
      : [...mocks];
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
   * Writes the local theme mirror and reloads. NO CLAIM about what paints.
   *
   * This is the seed-only half of what `setTheme` used to be, split out because
   * exactly one caller wants it: `app-boot.scenario.mjs` leaves a STALE mirror
   * on purpose and then asserts the database wins over it. For that scenario a
   * page that ignores the seed is the pass, so it must not go anywhere near
   * `setTheme`'s assertion.
   *
   * For "make the page dark and prove it", use `setTheme`.
   */
  async function seedStoredTheme(preference, target = page) {
    // `addInitScript` accumulates and runs in registration order, so a later
    // call overwrites an earlier one's value on the next navigation.
    await target.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, preference],
    );
    await target.reload({ waitUntil: "load" });
  }

  /**
   * The theme `setTheme` is currently holding the app to, or `null` before any
   * scenario has asked. Read by the `/preferences` rewriter below.
   */
  let heldTheme = null;
  let rewriterHandler = null;

  /** The scenario's own mock for this URL, if it registered one. Last wins. */
  const scenarioMockFor = (url) =>
    [...mocks]
      .reverse()
      .find(
        (entry) =>
          typeof entry.pattern === "string" &&
          globToRegExp(entry.pattern).test(url),
      ) ?? null;

  const rethemed = (base) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...base, theme: heldTheme }),
  });

  const carriesTheme = (value) =>
    Boolean(value) && typeof value === "object" && "theme" in value;

  /**
   * Makes `GET /preferences` answer with the theme `setTheme` asked for.
   *
   * THIS IS THE HALF THAT WAS MISSING, and the reason a dark capture of a
   * signed-in screen used to come back light. `localStorage` seeds the FIRST
   * PAINT and nothing more: for an authenticated account `app-boot.ts` then
   * fetches `/preferences`, calls `applyThemePreference` with the SERVER value
   * and re-persists it over the seed. The seed lost every time, silently, with
   * `.dark` on `<html>` for just long enough to look convincing.
   *
   * Rewriting the response drives the same `applyThemePreference` bootstrap the
   * app itself runs — it is not a patch to the app and not a forced class. It
   * is the same route the reporting agent found by hand, made the default.
   *
   * Three deliberate ways it declines to act, so it composes with the rest of
   * the runner instead of fighting it:
   *   - `heldTheme === null` — no scenario asked; the endpoint is untouched.
   *   - a non-GET — the theme TOGGLE's `PATCH` must reach the API, or
   *     `dialog-chrome`'s "click the real control" check stops meaning anything.
   *   - the scenario has its own mock here that is NOT a preferences body (a
   *     500, a `delay: Infinity`) — that mock is the point of the capture, so
   *     it is left alone. A mock that IS a preferences body is re-themed in
   *     place, which keeps `search-mobile-audit`'s pinned language intact.
   */
  async function installPreferencesRewriter() {
    // Re-registered on every `setTheme`, so it is always the MOST RECENT
    // handler for this URL. Playwright runs the last-registered matching route
    // first, and a scenario that (re-)mocks `/preferences` after a `setTheme`
    // would otherwise silently take the theme straight back.
    if (rewriterHandler) {
      await context.unroute(PREFERENCES_ROUTE, rewriterHandler);
    }

    rewriterHandler = async (route) => {
      const request = route.request();
      if (heldTheme === null || request.method() !== "GET") {
        return route.fallback();
      }

      const scenarioMock = scenarioMockFor(request.url());
      if (scenarioMock) {
        return carriesTheme(scenarioMock.body)
          ? route.fulfill(rethemed(scenarioMock.body))
          : route.fallback();
      }

      let upstream = null;
      try {
        upstream = await route.fetch();
      } catch {
        // The API is down or blocked. Nothing to re-theme; let the app see it.
      }
      if (!upstream) return route.fallback();

      let base = null;
      try {
        base = await upstream.json();
      } catch {
        // Not JSON — a 401 HTML page, say. Passed through unchanged below.
      }
      return upstream.ok() && carriesTheme(base)
        ? route.fulfill(rethemed(base))
        : route.fulfill({ response: upstream });
    };

    await context.route(PREFERENCES_ROUTE, rewriterHandler);
  }

  /**
   * Refuses to return until the requested theme is what is actually painted.
   *
   * A HELPER THAT QUIETLY RETURNS THE WRONG THEME IS WORSE THAN ONE THAT
   * REFUSES: a dark-mode check that silently captured light mode does not fail,
   * it PASSES while proving nothing, and every `dark:` variant it was supposed
   * to cover stays unverified. So this throws, with the numbers.
   *
   * Note what is asserted: the class `applyTheme` sets, plus a settle window,
   * plus the body's COMPUTED background in the error, so the report is evidence
   * rather than the runner's own expectation restated.
   */
  async function assertThemeIsPainted(target, preference) {
    const deadline = Date.now() + THEME_SETTLE_MS;
    let state = await target.evaluate(paintedThemeProbe, preference);
    while (state.painted !== state.expected && Date.now() < deadline) {
      await target.waitForTimeout(100);
      state = await target.evaluate(paintedThemeProbe, preference);
    }

    // The settle window. Reaching the right theme once is not the same as
    // holding it: boot applies the account's preference after `load`, which is
    // exactly how a dark page used to flip back between check and screenshot.
    await target.waitForTimeout(THEME_HOLD_MS);
    state = await target.evaluate(paintedThemeProbe, preference);
    if (state.painted === state.expected) return state;

    throw new Error(
      [
        `setTheme(${JSON.stringify(preference)}) did not take: the page is ` +
          `painted ${state.painted}, not ${state.expected}.`,
        `  documentElement.colorScheme  ${state.colorScheme || "(unset)"}`,
        `  computed body background     ${state.background}`,
        "",
        "  The theme did not survive boot. On a SIGNED-IN screen the stored",
        "  preference is the database, not localStorage: app-boot.ts fetches",
        "  GET /preferences and applies it over the seed. setTheme already",
        "  rewrites that response — so if you are here, something else is",
        "  answering it. Check whether this scenario mocks **/preferences",
        "  itself; a mock whose body has no `theme` key is left alone on",
        "  purpose. Give that mock a `theme`, or drop it.",
        "",
        "  Driving the theme through the real UI toggle instead? Do not mix it",
        "  with setTheme — see dialog-chrome.scenario.mjs.",
      ].join("\n"),
    );
  }

  /**
   * Puts the app in `theme` and PROVES it, for anonymous and signed-in alike.
   *
   * Deliberately NOT `documentElement.classList.add('dark')`: forcing the class
   * bypasses `applyTheme` in apps/web/src/lib/theme.ts, so a broken theme
   * bootstrap would still screenshot as a perfectly good dark page. Both halves
   * here go through the app's own code — the mirror it reads at first paint,
   * and the preferences response it reads a moment later.
   */
  async function setTheme(theme, target = page) {
    heldTheme = theme;
    await installPreferencesRewriter();
    await seedStoredTheme(theme, target);
    return assertThemeIsPainted(target, theme);
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
      seedStoredTheme,
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
  if (failed.length)
    detail(
      "Failed assertions",
      failed.map((a) => a.label),
    );

  const ok =
    !crash &&
    failed.length === 0 &&
    consoleErrors.length === 0 &&
    badRequests.length === 0;

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
  console.log(
    `  expected     ${expected.length} (from deliberate 4xx/5xx mocks)`,
  );
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
    console.error(
      "Usage: node scripts/visual/run.mjs <scenario.mjs> [--headed]",
    );
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

  if (config.testIdAttribute)
    selectors.setTestIdAttribute(config.testIdAttribute);

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
      const extra = await browser.newContext({
        ...contextOptions,
        ...overrides,
      });
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
