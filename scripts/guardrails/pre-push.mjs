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
 * 3. IT REFUSES TO HANG. Some api test files talk to a real Postgres, Redis,
 *    Mailpit or MinIO, and three need a funded OPENAI_API_KEY. Without docker
 *    running, the first group sits there for 60-90 seconds per file and then
 *    fails with a connection error — which is how a gate gets a reputation for
 *    being broken and starts getting bypassed. So: probe each service, probe
 *    the environment for a key, and SKIP what cannot run — loudly, by filename,
 *    with the command to run it properly. A narrowed run that announces what it
 *    narrowed is honest. A narrowed run that looks green is a lie, and the CI
 *    workflow makes the same promise.
 *
 *    THE PROBES ASK ABOUT THE SERVICE, NOT THE PORT. 5432, 6379 and 9000 are
 *    the defaults for Postgres, Redis and MinIO, so every other project on the
 *    machine answers them; a probe that reports a stranger's server as ours
 *    turns "not tested" into a red gate about somebody else's credentials. Each
 *    probe therefore asks something only our instance can answer, and each says
 *    in its own comment how strong that claim actually is.
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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const BUDGET_SECONDS = 90;
const MAX_ATTEMPTS = 3;

/* ─────────────────────────── test-scope facts ──────────────────────────── */

/**
 * api test files that open a real Postgres connection. Vitest paths, relative
 * to apps/api. Without docker these do not fail fast — they hang on connect.
 *
 * THE LIST IS DERIVABLE, so check it against the tree rather than trusting it:
 * a file needs Postgres exactly when it imports the live Drizzle handle,
 * `grep -rl 'from "./index.js"' src --include='*.test.ts'` in apps/api, plus
 * `container-wiring.test.ts`, which reaches it through the DI container. Three
 * of these were missing until 2026-09-05 — appearance, persona-other and
 * open-to-work — so a gate run with Postgres genuinely down went red on THEM
 * after correctly announcing it was skipping the other five. A skip list that
 * is almost complete produces the same red gate as no skip list at all.
 */
const NEEDS_POSTGRES = [
  "src/infra/di/container-wiring.test.ts",
  "src/infra/database/drizzle/search-indexes.e2e.test.ts",
  "src/infra/database/drizzle/user-appearance-mapping.e2e.test.ts",
  "src/infra/database/drizzle/user-email-verified-mapping.e2e.test.ts",
  "src/infra/database/drizzle/user-persona-other-mapping.e2e.test.ts",
  "src/infra/database/drizzle/user-preferences-constraints.e2e.test.ts",
  "src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts",
  "src/infra/http/controllers/resume/test/search-open-to-work-default.e2e.test.ts",
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
 * api test files that open a real SMTP connection to Mailpit. Also
 * self-skips (with its own console notice) when run outside this gate, but
 * excluded here too so the gate's own NOTICE block names it — same belt and
 * braces as NEEDS_POSTGRES.
 */
const NEEDS_MAILPIT = [
  "src/infra/providers/smtp-mail-provider.mailpit.e2e.test.ts",
];

/**
 * api test files that write a real object to the local MinIO and read it back
 * anonymously. Self-skips with its own console notice when run outside this
 * gate, and is excluded here too so the gate's NOTICE block names it — same
 * belt and braces as NEEDS_POSTGRES and NEEDS_MAILPIT.
 */
const NEEDS_MINIO = [
  "src/infra/providers/s3-file-storage-provider.minio.e2e.test.ts",
];

/**
 * api test files that open a real ioredis connection. Unlike the three lists
 * above these do NOT self-skip, and with `maxRetriesPerRequest: null` they do
 * not fail fast either: without a Redis they retry until vitest's 60-second
 * timeout, twice. Named here so the gate skips them loudly instead.
 */
const NEEDS_REDIS = [
  "src/infra/providers/bullmq-resume-embedding-queue.test.ts",
  "src/infra/providers/bullmq-activity-digest-queue.test.ts",
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
const explicitBase = argv.includes("--base")
  ? argv[argv.indexOf("--base") + 1]
  : null;

const steps = [];

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

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
 * The connection strings the api tests will actually use.
 *
 * `apps/api/src/test-setup.ts` is `import "dotenv/config"` and vitest runs with
 * cwd `apps/api`, so the file the tests read is `apps/api/.env` and a value
 * already in `process.env` wins over it — dotenv never overrides. This mirrors
 * that order exactly, because a probe that reads a DIFFERENT database URL than
 * the tests do is back to answering a question nobody asked.
 *
 * Parsed with a regex rather than by importing dotenv: the gate must run before
 * anything is installed or built, and this is two lines of the format.
 *
 * NOTHING HERE IS EVER PRINTED. The value is a password-bearing URL; it travels
 * to the probe through the child's environment (never argv, which `ps` shows to
 * every user on the box) and the child's output is discarded, not captured.
 */
function envValue(name) {
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess;

  const envFile = resolve(ROOT, "apps/api/.env");
  if (!existsSync(envFile)) return null;

  const match = readFileSync(envFile, "utf8").match(
    new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`, "m"),
  );
  if (!match) return null;

  const raw = match[1].trim().replace(/\s+#.*$/, "");
  const unquoted = raw.replace(/^(['"])([\s\S]*)\1$/, "$2");
  return unquoted.trim() || null;
}

/** `null` when the URL is missing or unparseable — never a thrown error. */
function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * A raw TCP connect, the cheapest possible "is anything there". Kept as the
 * FIRST half of the two service probes below: when the port is dead this
 * answers in a millisecond and no heavier probe has to run at all.
 */
function portOpen(host, port, timeoutMs) {
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

/**
 * Is THIS repo's Postgres on 5432 — not merely something.
 *
 * Same correction the MinIO probe got on 2026-09-04, for the same reason. A TCP
 * connect proves a port is open, and 5432 is the Postgres default, so every
 * other project on this machine answers it. When one does, the gate concludes
 * Postgres is available and runs `container-wiring.test.ts` and the three e2e
 * files against a stranger's server — which fails on authentication or on a
 * relation that does not exist, and produces a red gate that has nothing to do
 * with the change being pushed. "Not tested" turned into "broken" is a worse
 * outcome than either.
 *
 * So: connect with the credentials the tests themselves use and ask two
 * questions the port cannot answer — is this the database DATABASE_URL names,
 * and does it carry our schema (`profile_blocks` is ours and nobody else's).
 * A foreign Postgres fails the connect or answers with a different
 * `current_database()`, and the gate correctly reports Postgres unavailable and
 * says so by name in the TEST SCOPE NOTICE.
 *
 * A FALSE NEGATIVE HERE IS THE EXPENSIVE ONE — it silently drops four test
 * files — so the probe degrades instead of failing. If DATABASE_URL is absent
 * or unparseable, or the driver cannot be resolved, the answer is UNDECIDABLE
 * (exit 3) and the result falls back to the old port-only answer. Only a
 * decided "that is somebody else's database" reports unavailable.
 */
function postgresReachable(timeoutMs = 700) {
  const databaseUrl = envValue("DATABASE_URL");
  const parsed = parseUrl(databaseUrl);
  const host = process.env.PGHOST ?? parsed?.hostname ?? "127.0.0.1";
  const port = Number(process.env.PGPORT ?? parsed?.port ?? 5432);

  if (!portOpen(host, port, timeoutMs)) return false;

  // `decodeURIComponent`: a URL pathname is percent-encoded, a database name is
  // not. Empty pathname means the URL named no database, which is undecidable.
  const database = parsed?.pathname
    ? decodeURIComponent(parsed.pathname.replace(/^\//, ""))
    : "";

  let driverPath;
  try {
    driverPath = createRequire(import.meta.url).resolve("postgres");
  } catch {
    return true; // undecidable: node_modules is not installed yet
  }

  if (!databaseUrl || !database) return true; // undecidable: nothing to compare

  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const sql=require(${JSON.stringify(driverPath)})(process.env.__PROBE_URL,` +
        `{max:1,connect_timeout:2,idle_timeout:1,prepare:false,onnotice(){}});` +
        "sql`select current_database() as db, " +
        "to_regclass('public.profile_blocks') is not null as ours`" +
        `.then(rows=>rows[0]&&rows[0].db===process.env.__PROBE_DB&&rows[0].ours?0:1)` +
        `.catch(()=>1)` +
        `.then(code=>sql.end({timeout:0}).catch(()=>{}).then(()=>process.exit(code)));`,
    ],
    {
      stdio: "ignore",
      timeout: timeoutMs + 2000,
      env: { ...process.env, __PROBE_URL: databaseUrl, __PROBE_DB: database },
    },
  );

  // Killed by the timeout, or crashed before it could answer: undecidable.
  if (result.status === null || result.error) return true;
  return result.status === 0;
}

function hasOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * A TCP connect to Mailpit's SMTP port: what the test needs is a reachable
 * relay, not a specific way of having started one (`bash db-manage.sh admin`, a
 * bare `docker compose ... up -d mailpit`, or a developer's own Mailpit
 * instance all count).
 *
 * Deliberately still port-only, unlike Postgres, Redis and MinIO. 1025 is not a
 * default anything — it is Mailpit's own choice of an unprivileged SMTP port —
 * so "something is listening on 1025" is already a much narrower claim, and the
 * test's failure mode against a foreign relay is a refused RCPT, not a
 * misleading green. If that ever stops being true, this gets the same treatment
 * as the other three.
 */
function mailpitReachable(timeoutMs = 700) {
  return portOpen("127.0.0.1", 1025, timeoutMs);
}

/**
 * Is a REDIS on 6379 — not merely something.
 *
 * Third instance of the same correction. `bullmq-resume-embedding-queue.test.ts`
 * and `bullmq-activity-digest-queue.test.ts` open a real ioredis connection with
 * `maxRetriesPerRequest: null`, which means that against a port with nothing
 * useful behind it they do not fail — they RETRY, until vitest's 60-second
 * timeout, twice. That is precisely the hang design note 3 exists to prevent,
 * and until now nothing probed for Redis at all.
 *
 * The identity question is weaker here than for Postgres or MinIO, and saying
 * so is more useful than pretending otherwise: Redis has no per-project
 * namespace to ask about, and both tests already name their queue
 * `...-test-${process.pid}` and only ever obliterate that queue, so a foreign
 * Redis cannot corrupt them and they cannot corrupt it. What a TCP connect
 * genuinely cannot answer is whether the thing on 6379 is a Redis THESE TESTS
 * CAN USE — so the probe speaks the protocol and requires `+PONG`. A different
 * service answers with garbage or nothing; an instance that requires a password
 * our REDIS_URL does not carry answers `-NOAUTH`, which is a correct "no",
 * because the tests would fail against it too.
 */
function redisReachable(timeoutMs = 700) {
  const parsed = parseUrl(envValue("REDIS_URL"));
  const host = parsed?.hostname || "127.0.0.1";
  const port = Number(parsed?.port || 6379);

  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const s=require('net').connect(${port},${JSON.stringify(host)});` +
        `let b='';const done=c=>{s.destroy();process.exit(c)};` +
        `s.setTimeout(${timeoutMs});` +
        // Inline command, not RESP: a Redis accepts both, and this way a
        // half-written pipelined reply cannot be mistaken for a PONG.
        `s.on('connect',()=>s.write('PING\\r\\n'));` +
        `s.on('data',d=>{b+=d.toString('latin1');` +
        `if(b.length>=7)done(b.startsWith('+PONG\\r\\n')?0:1)});` +
        `s.on('error',()=>done(1));` +
        `s.on('timeout',()=>done(1));`,
    ],
    { stdio: "ignore", timeout: timeoutMs + 2000 },
  );
  return result.status === 0;
}

/**
 * A TCP connect to MinIO's S3 API port, same shape as the two probes above:
 * what the test needs is a reachable object store, not a particular way of
 * having started one (`bash db-manage.sh start`, a bare `docker compose ... up
 * -d minio`, or a developer's own MinIO all count).
 */
/**
 * Is THIS repo's MinIO on 9000 — not merely something.
 *
 * This was a TCP connect probe, and that is not the same question. Port 9000 is
 * the MinIO default, so any other project's MinIO answers it. When one did, the
 * gate concluded MinIO was available, ran the e2e tests against a stranger's
 * instance, and failed with "The Access Key Id you provided does not exist in
 * our records" — a red gate that had nothing to do with the change being
 * pushed. A probe that answers a different question than the one you asked is
 * worse than no probe: it converts "not tested" into "broken".
 *
 * So: ask anonymously for the bucket the dev compose creates. `minio-setup`
 * makes `crafthub-media` public-read, which is the very thing the e2e test
 * asserts, so ours answers 200. A foreign MinIO answers 403 AccessDenied (or
 * 404 NoSuchBucket), and we correctly report MinIO as unavailable and say so by
 * name in the TEST SCOPE NOTICE.
 */
function minioReachable(timeoutMs = 700) {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const t=setTimeout(()=>process.exit(1),${timeoutMs});` +
        `fetch('http://127.0.0.1:9000/crafthub-media/')` +
        `.then(r=>{clearTimeout(t);process.exit(r.status===403||r.status===404?1:0)})` +
        `.catch(()=>{clearTimeout(t);process.exit(1)});`,
    ],
    { encoding: "utf8", timeout: timeoutMs + 2000 },
  );
  return result.status === 0;
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
  return (
    run("npx", ["turbo", "run", "check-types", `--filter=...[${base}]`])
      .status === 0
  );
}

function lintChanged(base) {
  return (
    run(process.execPath, [
      resolve(ROOT, "scripts/guardrails/lint-changed.mjs"),
      "--base",
      base,
    ]).status === 0
  );
}

/**
 * Every reason a file can be held back, with what that costs.
 *
 * `covers` is why this list is a table rather than four `if` blocks: the notice
 * used to end in a FIXED sentence naming semantic search, the pgvector indexes
 * and the DI container wiring, printed whenever anything at all was skipped. So
 * a run that skipped only the Mailpit file announced that pgvector was
 * unverified — while a run with docker up and no OpenAI key announced the
 * container wiring was unverified when it had just passed. A scope notice that
 * overstates what it missed is the same failure as one that understates it:
 * either way you stop believing it. The sentence is now assembled from the
 * groups that actually fired.
 */
const TEST_SCOPE_GROUPS = [
  {
    files: NEEDS_POSTGRES,
    available: () => postgresReachable(),
    reason:
      "This repo's Postgres is not reachable on 5432 — start it with `bash " +
      "db-manage.sh start`. (Another project's Postgres on 5432 does not " +
      "count, and neither does ours without its migrations.)",
    covers: "the pgvector indexes and the DI container wiring",
  },
  {
    files: NEEDS_OPENAI_KEY,
    available: () => hasOpenAiKey(),
    reason:
      "OPENAI_API_KEY is not set — these call the live API and cost money per run.",
    covers: "semantic-search relevance",
  },
  {
    files: NEEDS_MAILPIT,
    available: () => mailpitReachable(),
    reason:
      "Mailpit is not reachable on 1025 — start it with `docker compose -f " +
      "docker-compose.dev.yml --profile tools up -d mailpit` (or `bash " +
      "db-manage.sh admin`).",
    covers: "real SMTP delivery",
  },
  {
    files: NEEDS_MINIO,
    available: () => minioReachable(),
    reason:
      "MinIO is not reachable on 9000 — start it with `bash db-manage.sh " +
      "start` (or `docker compose -f docker-compose.dev.yml up -d minio " +
      "minio-setup`).",
    covers: "the real object-storage upload path",
  },
  {
    files: NEEDS_REDIS,
    available: () => redisReachable(),
    reason:
      "Redis is not answering PING on 6379 — start it with `bash " +
      "db-manage.sh start` (or `docker compose -f docker-compose.dev.yml up " +
      "-d redis`).",
    covers: "the BullMQ deduplication window against a real Redis",
  },
];

/** "a", "a and b", "a, b and c" — the notice is prose, not a bullet list. */
function joinWithAnd(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function apiTests() {
  const skipped = new Set();
  const reasons = [];
  const uncovered = [];

  for (const group of TEST_SCOPE_GROUPS) {
    if (group.available()) continue;
    for (const file of group.files) skipped.add(file);
    reasons.push(group.reason);
    uncovered.push(group.covers);
  }

  if (skipped.size > 0) {
    say("");
    say("    ┌─ TEST SCOPE NOTICE — these api test files were NOT run");
    for (const file of [...skipped].sort()) say(`    │  ${file}`);
    for (const reason of reasons) say(`    │  ${reason}`);
    const verb = uncovered.length > 1 ? "are" : "is";
    say(
      `    │  ${capitalize(joinWithAnd(uncovered))} ${verb} therefore UNVERIFIED`,
    );
    say("    │  by this run. To cover them:");
    say("    │    bash db-manage.sh start && npm run test --workspace=api");
    say("    └─");
    say("");
  }

  const excludes = [...VITEST_DEFAULT_EXCLUDES, ...skipped].flatMap(
    (pattern) => ["--exclude", pattern],
  );

  return (
    run("npx", ["vitest", "run", ...excludes], {
      cwd: resolve(ROOT, "apps/api"),
    }).status === 0
  );
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

/**
 * The harness — AGENTS.md, the nested workspace files, the skills — is prose
 * that four coding tools read as instructions, and nothing else in this gate
 * looks at it. A renamed file leaves a rule pointing at nothing; a file that
 * grows past 32 KiB is silently truncated by Codex. Sub-second, so it runs
 * unconditionally like the i18n pair rather than only on affected packages.
 */
function harnessCheck() {
  return (
    run(process.execPath, [
      resolve(ROOT, "scripts/guardrails/harness-check.mjs"),
    ]).status === 0
  );
}

/**
 * DESIGN.md's palette, as a check. `text-gray-500` next to `text-zinc-500` is
 * invisible in a diff and obvious on the screen, and an arbitrary hex in a
 * class bypasses the token system at the one place it is meant to apply.
 * Sub-second, so it runs unconditionally alongside the other doc-level checks.
 */
function designTokens() {
  return (
    run(process.execPath, [
      resolve(ROOT, "scripts/guardrails/design-tokens.mjs"),
    ]).status === 0
  );
}

function i18nParity() {
  return (
    run(process.execPath, [resolve(ROOT, "scripts/guardrails/i18n-parity.mjs")])
      .status === 0
  );
}

/**
 * The other half of parity: parity proves every key exists in all three
 * locales, this proves the string became a key at all. Both are sub-second, so
 * they run unconditionally rather than only on affected packages.
 */
function i18nRawStrings() {
  return (
    run(process.execPath, [
      resolve(ROOT, "scripts/guardrails/i18n-raw-strings.mjs"),
    ]).status === 0
  );
}

/* ──────────────────────────────── the run ──────────────────────────────── */

function main() {
  const startedAt = Date.now();
  const attempts = isStopHook ? readAttempts() : 0;

  if (isStopHook && attempts >= MAX_ATTEMPTS) {
    say("");
    say("⚠️  GUARDRAILS LOOP GUARD TRIPPED");
    say(
      `   The gate has blocked ${attempts} times in a row without going green.`,
    );
    say("   Letting this stop through so the session does not loop forever.");
    say(
      "   THE TREE IS STILL RED. Run `npm run guardrails` and read the output,",
    );
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
    if (ok)
      ok = step("test — other workspaces (affected)", () => otherTests(base));
  } else if (skipTests) {
    say("  · tests skipped (--skip-tests)");
  }

  if (ok) ok = step("harness (cites, budgets, skills)", harnessCheck);
  if (ok) ok = step("design tokens (palette)", designTokens);
  if (ok) ok = step("i18n locale parity", i18nParity);
  if (ok) ok = step("i18n raw strings", i18nRawStrings);

  const elapsed = (Date.now() - startedAt) / 1000;
  say("");
  say(
    `   total ${elapsed.toFixed(1)}s${elapsed > BUDGET_SECONDS ? `  ⚠️  over the ${BUDGET_SECONDS}s budget` : ""}`,
  );

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
    say(
      `   (attempt ${attempts + 1} of ${MAX_ATTEMPTS} before the loop guard releases the stop)`,
    );
  }
  say("");
  return 2;
}

process.exit(main());
