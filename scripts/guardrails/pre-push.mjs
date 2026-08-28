#!/usr/bin/env node
/**
 * THE GATE.
 *
 * One script, three callers, identical behaviour:
 *   - `.husky/pre-push`                  — the real gate; a red run stops the push
 *   - the Claude Code `Stop` hook        — an agent cannot call itself done on a red tree
 *   - `npm run guardrails`               — a human running it on purpose
 *
 * DESIGN NOTES, because each of these was a decision and not an accident:
 *
 * 1. IT IS AFFECTED-SCOPED. `turbo run <task> --filter=...[<base>]` against the
 *    merge-base with origin/main, so touching one web component does not
 *    type-check and re-test the whole monorepo. The budget is < 90 seconds; the
 *    script prints its own timings so the budget is falsifiable rather than
 *    aspirational.
 *
 * 2. IT BUILDS @repo/schemas FIRST, ALWAYS. apps/api, apps/web, apps/mcp,
 *    apps/extractor and apps/training all resolve `@repo/schemas` through its
 *    published `dist/index.d.ts`. On a tree where schemas has not been built,
 *    check-types fails with errors that point at consumers and say nothing
 *    about the real cause. This is the one step that is never skipped.
 *
 * 3. IT REFUSES TO HANG. Three api test files talk to a real Postgres and three
 *    need a funded OPENAI_API_KEY. Without docker running, the first group sits
 *    there for 60-90 seconds per file and then fails with a connection error —
 *    which is how a gate gets a reputation for being broken and starts getting
 *    bypassed. So: probe port 5432, probe the environment for a key, and SKIP
 *    what cannot run — loudly, by filename, with the command to run it properly.
 *    A narrowed run that announces what it narrowed is honest. A narrowed run
 *    that looks green is a lie, and the CI workflow makes the same promise.
 *
 * 4. LINT IS RATCHETED, NOT ENFORCED WHOLESALE. See lint-changed.mjs.
 *
 * 5. ONLY EXIT 2 BLOCKS. Claude Code's Stop hook treats exit 2 as "blocked, here
 *    is why" and feeds stderr back to the model; every other non-zero code is
 *    just noise in the transcript. git hooks treat any non-zero as a block, so
 *    exit 2 satisfies both callers with one code path.
 *
 * 6. THREE-ATTEMPT LOOP GUARD. An agent that cannot fix a failure will otherwise
 *    bounce off the Stop hook forever, burning tokens. After three consecutive
 *    blocks the gate lets the stop through with a very loud warning. The counter
 *    is cleared by any passing run and lives in the git dir, so it is per
 *    worktree and never committed.
 *
 * Flags:
 *   --stop-hook      called from the Claude Code Stop hook (enables the loop guard)
 *   --base <ref>     compare against <ref> instead of the merge-base with origin/main
 *   --no-fetch       skip `git fetch` (offline, or you already fetched)
 *   --skip-tests     type-check + lint only
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const BUDGET_SECONDS = 90;
const MAX_ATTEMPTS = 3;

/* ─────────────────────────── test-scope facts ──────────────────────────── */

/**
 * api test files that open a real Postgres connection. Vitest paths, relative
 * to apps/api. Without docker these do not fail fast — they hang on connect.
 */
const NEEDS_POSTGRES = [
  "src/infra/di/container-wiring.test.ts",
  "src/infra/database/drizzle/search-indexes.e2e.test.ts",
  "src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts",
];

/**
 * api test files that call the live OpenAI API and cost money per run. CI
 * excludes exactly these three by name; the gate replicates that list so local
 * and CI agree on what "the suite passed" means.
 */
const NEEDS_OPENAI_KEY = [
  "src/infra/http/controllers/resume/test/search.e2e.test.ts",
  "src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts",
  "src/infra/database/drizzle/search-indexes.e2e.test.ts",
];

/**
 * vitest's CLI `--exclude` REPLACES `test.exclude` instead of adding to it, so
 * these two defaults have to be repeated or vitest starts collecting test files
 * out of node_modules. Same footgun, same fix, as in .github/workflows/ci.yml.
 */
const VITEST_DEFAULT_EXCLUDES = ["**/node_modules/**", "**/dist/**"];

/* ──────────────────────────────── plumbing ─────────────────────────────── */

const argv = process.argv.slice(2);
const isStopHook = argv.includes("--stop-hook");
const skipTests = argv.includes("--skip-tests");
const noFetch = argv.includes("--no-fetch");
const explicitBase = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : null;

const steps = [];

function say(message = "") {
  // stderr, not stdout: Claude Code's Stop hook feeds stderr back to the model
  // on exit 2. Reporting to stdout would block the agent with no explanation.
  process.stderr.write(`${message}\n`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : ["ignore", 2, 2],
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

function git(args) {
  const result = run("git", args, { capture: true });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

/** Runs one gate step, records its timing, and short-circuits the rest on failure. */
function step(name, fn) {
  const startedAt = Date.now();
  const ok = fn();
  const seconds = (Date.now() - startedAt) / 1000;
  steps.push({ name, ok, seconds });
  say(`  ${ok ? "✔" : "✘"} ${name}  (${seconds.toFixed(1)}s)`);
  return ok;
}

/* ─────────────────────────────── loop guard ────────────────────────────── */

/**
 * `git rev-parse --git-dir` resolves to `.git/worktrees/<name>` inside a linked
 * worktree, so the counter is per worktree — two agents on two branches do not
 * share an attempt budget — and it is inside the git dir, so it is never
 * committed and never shows up in `git status`.
 */
function counterPath() {
  const gitDir = git(["rev-parse", "--absolute-git-dir"]);
  if (!gitDir) return null;
  return resolve(gitDir, "guardrails-attempts");
}

function readAttempts() {
  const path = counterPath();
  if (!path || !existsSync(path)) return 0;
  const parsed = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeAttempts(value) {
  const path = counterPath();
  if (!path) return;
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, String(value));
}

function clearAttempts() {
  const path = counterPath();
  if (path && existsSync(path)) rmSync(path, { force: true });
}

/* ───────────────────────────── infra probes ────────────────────────────── */

/**
 * A TCP connect to 5432, not `docker compose ps`: what the tests actually need
 * is a reachable Postgres, and a developer running one outside compose (or
 * pointing DATABASE_URL somewhere else entirely) is a perfectly good answer
 * that `docker compose ps` would call "down".
 */
function postgresReachable(timeoutMs = 700) {
  const port = Number(process.env.PGPORT ?? 5432);
  const host = process.env.PGHOST ?? "127.0.0.1";
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const s=require('net').connect(${port},${JSON.stringify(host)});` +
        `s.setTimeout(${timeoutMs});` +
        `s.on('connect',()=>{s.destroy();process.exit(0)});` +
        `s.on('error',()=>process.exit(1));` +
        `s.on('timeout',()=>{s.destroy();process.exit(1)});`,
    ],
    { encoding: "utf8", timeout: timeoutMs + 2000 },
  );
  return result.status === 0;
}

function hasOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/* ────────────────────────── affected-workspace set ─────────────────────── */

function resolveBase() {
  if (explicitBase) return explicitBase;

  if (!noFetch) {
    // Explicit and time-boxed. `--filter=...[<base>]` compares against a ref
    // that has to actually exist locally; a stale origin/main silently widens
    // or narrows the affected set, which is worse than a slow fetch.
    run("git", ["fetch", "--quiet", "origin", "main"], { capture: true });
  }

  for (const ref of ["origin/main", "main"]) {
    const base = git(["merge-base", ref, "HEAD"]);
    if (base) return base;
  }
  return git(["rev-parse", "HEAD~1"]) ?? "HEAD";
}

/**
 * Asks turbo which workspaces a task would actually run for. Used to decide
 * whether apps/api is in scope, because api needs a hand-built vitest command
 * (see the exclusion lists) rather than the generic `turbo run test`.
 */
function affectedPackages(task, base) {
  const result = run(
    "npx",
    ["turbo", "run", task, `--filter=...[${base}]`, "--dry=json"],
    { capture: true },
  );
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse(String(result.stdout));
    const fromTasks = (parsed.tasks ?? []).map((entry) => entry.package);
    return new Set(fromTasks.filter(Boolean));
  } catch {
    return null;
  }
}

/* ──────────────────────────────── the steps ────────────────────────────── */

function buildSchemas() {
  return run("npm", ["run", "build:schemas"], { capture: true }).status === 0;
}

function checkTypes(base) {
  return run("npx", ["turbo", "run", "check-types", `--filter=...[${base}]`]).status === 0;
}

function lintChanged(base) {
  return run(process.execPath, [
    resolve(ROOT, "scripts/guardrails/lint-changed.mjs"),
    "--base",
    base,
  ]).status === 0;
}

function apiTests() {
  const skipped = new Set();
  const reasons = [];

  if (!postgresReachable()) {
    for (const file of NEEDS_POSTGRES) skipped.add(file);
    reasons.push(
      "Postgres is not reachable on 5432 — start it with `bash db-manage.sh start`.",
    );
  }
  if (!hasOpenAiKey()) {
    for (const file of NEEDS_OPENAI_KEY) skipped.add(file);
    reasons.push(
      "OPENAI_API_KEY is not set — these call the live API and cost money per run.",
    );
  }

  if (skipped.size > 0) {
    say("");
    say("    ┌─ TEST SCOPE NOTICE — these api test files were NOT run");
    for (const file of [...skipped].sort()) say(`    │  ${file}`);
    for (const reason of reasons) say(`    │  ${reason}`);
    say("    │  Semantic search, the pgvector indexes and the DI container wiring");
    say("    │  are therefore UNVERIFIED by this run. To cover them:");
    say("    │    bash db-manage.sh start && npm run test --workspace=api");
    say("    └─");
    say("");
  }

  const excludes = [...VITEST_DEFAULT_EXCLUDES, ...skipped].flatMap((pattern) => [
    "--exclude",
    pattern,
  ]);

  return run("npx", ["vitest", "run", ...excludes], {
    cwd: resolve(ROOT, "apps/api"),
  }).status === 0;
}

function otherTests(base) {
  const result = run("npx", [
    "turbo",
    "run",
    "test",
    `--filter=...[${base}]`,
    "--filter=!api",
  ]);
  return result.status === 0;
}

function i18nParity() {
  return run(process.execPath, [resolve(ROOT, "scripts/guardrails/i18n-parity.mjs")])
    .status === 0;
}

/**
 * The other half of parity: parity proves every key exists in all three
 * locales, this proves the string became a key at all. Both are sub-second, so
 * they run unconditionally rather than only on affected packages.
 */
function i18nRawStrings() {
  return run(process.execPath, [
    resolve(ROOT, "scripts/guardrails/i18n-raw-strings.mjs"),
  ]).status === 0;
}

/* ──────────────────────────────── the run ──────────────────────────────── */

function main() {
  const startedAt = Date.now();
  const attempts = isStopHook ? readAttempts() : 0;

  if (isStopHook && attempts >= MAX_ATTEMPTS) {
    say("");
    say("⚠️  GUARDRAILS LOOP GUARD TRIPPED");
    say(`   The gate has blocked ${attempts} times in a row without going green.`);
    say("   Letting this stop through so the session does not loop forever.");
    say("   THE TREE IS STILL RED. Run `npm run guardrails` and read the output,");
    say("   or hand it to a human — do not push and do not call this done.");
    say("");
    clearAttempts();
    return 0;
  }

  const base = resolveBase();
  say("");
  say(`── guardrails ${"─".repeat(52)}`);
  say(`   base ${base.slice(0, 12)}   budget ${BUDGET_SECONDS}s`);
  say("");

  // Non-negotiable and unconditional: everything downstream type-checks against
  // the built dist/ of @repo/schemas.
  let ok = step("build @repo/schemas", buildSchemas);

  if (ok) ok = step("check-types (affected)", () => checkTypes(base));
  if (ok) ok = step("lint (changed files, ratcheted)", () => lintChanged(base));

  if (ok && !skipTests) {
    const affected = affectedPackages("test", base);
    // A null set means turbo could not answer; running everything is the safe
    // reading of "I do not know what changed".
    const apiAffected = affected === null || affected.has("api");

    if (apiAffected) ok = step("test — api", apiTests);
    if (ok) ok = step("test — other workspaces (affected)", () => otherTests(base));
  } else if (skipTests) {
    say("  · tests skipped (--skip-tests)");
  }

  if (ok) ok = step("i18n locale parity", i18nParity);
  if (ok) ok = step("i18n raw strings", i18nRawStrings);

  const elapsed = (Date.now() - startedAt) / 1000;
  say("");
  say(`   total ${elapsed.toFixed(1)}s${elapsed > BUDGET_SECONDS ? `  ⚠️  over the ${BUDGET_SECONDS}s budget` : ""}`);

  if (ok) {
    clearAttempts();
    // The literal string the hooks and the docs agree on. Anything that greps
    // for success greps for this line, so it must not be decorated.
    say("guardrails PASS");
    say("");
    return 0;
  }

  const failed = steps.find((entry) => !entry.ok);
  say("");
  say(`guardrails FAIL — ${failed ? failed.name : "unknown step"}`);
  say("   Fix the CAUSE. Do not add an eslint-disable, a `.skip`, a type");
  say("   assertion or a `--no-verify` to get past this.");
  if (isStopHook) {
    writeAttempts(attempts + 1);
    say(`   (attempt ${attempts + 1} of ${MAX_ATTEMPTS} before the loop guard releases the stop)`);
  }
  say("");
  return 2;
}

process.exit(main());
