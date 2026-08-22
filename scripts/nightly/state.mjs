#!/usr/bin/env node
/**
 * THE NIGHTLY LOOP'S MEMORY.
 *
 * WHY A FILE AND NOT A CONVERSATION: every iteration of the nightly loop is a
 * brand-new `claude -p` process with an empty context. Nothing survives between
 * iterations except what is on disk. That is the whole point — a single
 * long-lived agent degrades as its context fills, and "start a new agent at 65%
 * context" is a heuristic you have to remember to honour. A fresh process per
 * unit of work makes the context reset structural instead.
 *
 * So this file is the loop's entire continuity:
 *
 *   .nightly/STATE.json   the machine state — phase, iteration, budget, guards
 *   .nightly/QUEUE.json   the work — candidates, confirmed bugs, fixes, escalations
 *   .nightly/MEMORY.md    the narrative — what previous iterations LEARNED
 *
 * STATE and QUEUE are structured because the orchestrator (bash) has to reason
 * about them. MEMORY.md is prose because the next agent has to read it, and the
 * things worth carrying forward — "the layout editor's save is debounced 800ms",
 * "seed-go-sre-026 now owns three test links" — do not fit a schema.
 *
 * Commands:
 *   init [--hours N] [--budget-usd N]   create the tree (idempotent)
 *   get <dotted.path>                   print a value
 *   set <dotted.path> <json>            write a value
 *   begin-iteration                     stamp a new iteration, print its number
 *   end-iteration --cost N --outcome ok|fail
 *   should-continue                     exit 0 to keep looping, 1 to stop (prints why)
 *   summary                             human-readable status block
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DIR = resolve(ROOT, ".nightly");
const STATE = resolve(DIR, "STATE.json");
const QUEUE = resolve(DIR, "QUEUE.json");
const MEMORY = resolve(DIR, "MEMORY.md");

/**
 * The phase machine. `next` is what an agent is ALLOWED to set as `next_phase`;
 * anything else is rejected by the orchestrator and treated as a failed
 * iteration, because a wrong phase silently reroutes the whole night.
 */
export const PHASES = {
  BOOTSTRAP: { next: ["HUNT", "REPORT"] },
  HUNT: { next: ["HUNT", "TRIAGE", "REPORT"] },
  TRIAGE: { next: ["FIX", "HUNT", "REGRESSION", "REPORT"] },
  FIX: { next: ["REVIEW_FIX", "TRIAGE", "REPORT"] },
  REVIEW_FIX: { next: ["FIX", "TRIAGE", "REGRESSION", "REPORT"] },
  REGRESSION: { next: ["TRIAGE", "FIX", "REPORT"] },
  REPORT: { next: ["DONE"] },
  DONE: { next: [] },
};

/** Three failed fix attempts on one bug means the fix is not mechanical. Escalate. */
const MAX_FIX_ATTEMPTS = 3;
/** Three dead iterations in a row means the loop itself is broken, not the code. */
const MAX_CONSECUTIVE_FAILURES = 3;

const readJson = (path, fallback) => {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const readState = () => readJson(STATE, null);
const writeState = (value) => writeJson(STATE, value);

function dig(object, path) {
  return path.split(".").reduce((node, key) => (node == null ? node : node[key]), object);
}

function plant(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((node, key) => (node[key] ??= {}), object);
  target[last] = value;
}

/* ────────────────────────────── commands ───────────────────────────────── */

function init(args) {
  mkdirSync(DIR, { recursive: true });
  mkdirSync(resolve(DIR, "logs"), { recursive: true });
  mkdirSync(resolve(DIR, "evidence"), { recursive: true });

  if (existsSync(STATE)) {
    console.log("STATE.json already exists — leaving it alone. Delete .nightly/ to start over.");
    return 0;
  }

  const hours = Number(flag(args, "--hours") ?? 8);
  const budget = Number(flag(args, "--budget-usd") ?? 0);
  const now = new Date();
  const deadline = new Date(now.getTime() + hours * 3600_000);

  writeState({
    version: 1,
    run_id: now.toISOString(),
    started_at: now.toISOString(),
    deadline_at: deadline.toISOString(),
    phase: "BOOTSTRAP",
    next_phase: null,
    iteration: 0,
    iteration_started_at: null,
    /**
     * `spent_usd` is advisory: it is the sum of what each `claude -p` reported,
     * so it lags a killed iteration. The hard stop is the deadline.
     */
    budget: { total_usd: budget, spent_usd: 0, per_iteration_usd: Number(flag(args, "--per-iteration-usd") ?? 8) },
    guards: {
      consecutive_failures: 0,
      max_consecutive_failures: MAX_CONSECUTIVE_FAILURES,
      fix_attempts: 0,
      max_fix_attempts: MAX_FIX_ATTEMPTS,
      hunt_rounds: 0,
      /* Claude plan usage limits — see noteLimitWait(). */
      limit_waits: 0,
      limit_wait_seconds: 0,
      max_limit_wait_seconds: Number(flag(args, "--max-limit-wait-hours") ?? 6) * 3600,
    },
    /** The bug the FIX / REVIEW_FIX pair is currently working. */
    current_bug_id: null,
    /** Set by REVIEW_FIX when it rejects, read by the next FIX agent. */
    review_feedback: null,
    counters: { candidates: 0, confirmed: 0, fixed: 0, escalated: 0, rejected: 0 },
    history: [],
  });

  if (!existsSync(QUEUE)) {
    writeJson(QUEUE, { candidates: [], confirmed: [], fixed: [], escalated: [], rejected: [] });
  }

  if (!existsSync(MEMORY)) {
    writeFileSync(
      MEMORY,
      [
        "# Nightly loop memory",
        "",
        "Written by each iteration, read by the next. This is prose on purpose:",
        "the things worth carrying forward do not fit a schema.",
        "",
        "**Append, do not rewrite.** An iteration that deletes a previous",
        "iteration's note has destroyed the only copy.",
        "",
        "Keep it under ~400 lines. When it grows past that, collapse the oldest",
        "entries into a single 'Established facts' bullet list at the top rather",
        "than dropping them.",
        "",
        "## Established facts",
        "",
        "- Stack: docker postgres (linkhub-postgres-dev) + redis, both healthy.",
        "- DB `linkhub_dev`, user `linkhub_user`, ~307 users / 301 resume embeddings seeded.",
        "- Seed password for every seeded account is `12345678`.",
        "- Dev servers: api :3333, web :5173. The orchestrator keeps them up; do not restart them.",
        "- e2e harness: `playwright.config.ts` + `e2e/support/*` + `e2e/journeys/*.spec.ts`.",
        "- Run the suite with `npx playwright test --project=desktop` (add `--project=mobile` for @responsive).",
        "",
        "### Budget the recruiter search quota",
        "",
        "`POST /resumes/search` is quota-guarded by `AI_QUOTA_RECRUITER_SEARCH_DAILY`",
        "(default **30/day/user**) and each call costs a query-conversion completion",
        "plus an embedding. Journey 03 alone spends ~3 real searches per desktop run.",
        "A HUNT lane that re-runs the suite in a loop WILL exhaust the recruiter",
        "account's daily quota and every later search will fail for a reason that is",
        "not a product bug. Drive loading/empty/error states with `page.route` mocks",
        "and spend real searches only where relevance itself is under test.",
        "",
        "### Known harness facts",
        "",
        "- `@repo/schemas` cannot be imported from a Playwright spec: its `exports`",
        "  map declares only an `import` condition and Playwright's TS loader emits",
        "  CommonJS. Specs import `../../packages/schemas/dist/index.js` directly, so",
        "  they depend on `npm run build:schemas` having run first.",
        "- A first-ever visit to `/dashboard/search` makes Vite optimize the",
        "  TensorFlow.js dep and answer with a full page reload; a submit in that",
        "  window is silently discarded. This is a dev-server artifact, NOT a product",
        "  bug — do not file it. `openSearchPage()` in journey 03 handles it.",
        "",
        "## Iteration log",
        "",
      ].join("\n"),
    );
  }

  console.log(`Initialised .nightly/ — deadline ${deadline.toISOString()}, budget $${budget || "unlimited"}.`);
  return 0;
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function get(args) {
  const state = readState();
  if (!state) {
    console.error("No STATE.json. Run: node scripts/nightly/state.mjs init");
    return 1;
  }
  const value = dig(state, args[0] ?? "");
  console.log(typeof value === "object" ? JSON.stringify(value) : String(value ?? ""));
  return 0;
}

function set(args) {
  const state = readState();
  if (!state) return 1;
  let value = args[1];
  try {
    value = JSON.parse(args[1]);
  } catch {
    /* a bare string is fine */
  }
  plant(state, args[0], value);
  writeState(state);
  return 0;
}

function beginIteration() {
  const state = readState();
  if (!state) return 1;
  state.iteration += 1;
  state.iteration_started_at = new Date().toISOString();
  writeState(state);
  console.log(String(state.iteration));
  return 0;
}

/**
 * Closes the books on one iteration. The important work here is the phase
 * transition: an agent proposes `next_phase`, and this is where that proposal
 * is validated against the machine. An agent that proposes an illegal phase
 * does not get to reroute the night — the transition is refused and the
 * iteration counts as a failure.
 */
function endIteration(args) {
  const state = readState();
  if (!state) return 1;

  const cost = Number(flag(args, "--cost") ?? 0);
  const outcome = flag(args, "--outcome") ?? "fail";
  if (Number.isFinite(cost)) state.budget.spent_usd = Number((state.budget.spent_usd + cost).toFixed(4));

  const from = state.phase;
  const proposed = state.next_phase;
  let to = from;
  let note = "";

  if (outcome === "ok" && proposed && PHASES[from]?.next.includes(proposed)) {
    to = proposed;
    state.guards.consecutive_failures = 0;
  } else if (outcome === "ok" && proposed) {
    note = `refused illegal transition ${from} -> ${proposed}`;
    state.guards.consecutive_failures += 1;
  } else if (outcome === "ok") {
    note = "iteration reported ok but set no next_phase";
    state.guards.consecutive_failures += 1;
  } else {
    note = "iteration failed";
    state.guards.consecutive_failures += 1;
  }

  /**
   * Only a SUCCESSFUL hunt counts as a round. A crashed iteration also leaves
   * phase at HUNT, and counting it would push the loop into TRIAGE having
   * actually hunted less than it thinks.
   */
  if (from === "HUNT" && to === "HUNT" && outcome === "ok" && !note) state.guards.hunt_rounds += 1;

  /* A fix that keeps bouncing off review is not a mechanical fix. */
  if (from === "REVIEW_FIX" && to === "FIX") {
    state.guards.fix_attempts += 1;
    if (state.guards.fix_attempts >= state.guards.max_fix_attempts) {
      to = "TRIAGE";
      note = `${note} | ${state.current_bug_id} hit max fix attempts, escalating`;
      state.guards.fix_attempts = 0;
      state.current_bug_id = null;
    }
  }
  if (to === "TRIAGE" || to === "HUNT") state.guards.fix_attempts = 0;

  state.history.push({
    iteration: state.iteration,
    from,
    to,
    outcome,
    cost_usd: cost,
    started_at: state.iteration_started_at,
    ended_at: new Date().toISOString(),
    note: note || undefined,
  });
  state.phase = to;
  state.next_phase = null;
  writeState(state);

  console.log(`${from} -> ${to}${note ? ` (${note})` : ""}`);
  return 0;
}

/**
 * Records a pause for a Claude plan usage limit.
 *
 * A usage limit is NOT a failure: nothing is wrong with the code, the loop, or
 * the iteration's reasoning — the allowance simply reset-timer'd out. Counting
 * it against `consecutive_failures` would burn the three-strikes guard in three
 * quick retries and end the night at 1am with hours of allowance still to come.
 *
 * It also extends the deadline by the time spent waiting, because the deadline
 * exists to bound WORK, not wall-clock. A run asked for 8 hours of hunting
 * should not lose 3 of them to a reset window. `max_limit_wait_seconds` caps the
 * total extension so an exhausted account cannot keep a run alive indefinitely.
 */
function noteLimitWait(args) {
  const state = readState();
  if (!state) return 1;
  const seconds = Math.max(0, Number(flag(args, "--seconds") ?? 0));

  state.guards.limit_waits = (state.guards.limit_waits ?? 0) + 1;
  const waitedSoFar = (state.guards.limit_wait_seconds ?? 0) + seconds;
  state.guards.limit_wait_seconds = waitedSoFar;

  const cap = state.guards.max_limit_wait_seconds ?? 6 * 3600;
  let extendedBy = 0;
  if (waitedSoFar <= cap) {
    extendedBy = seconds;
    state.deadline_at = new Date(Date.parse(state.deadline_at) + seconds * 1000).toISOString();
  }

  state.history.push({
    iteration: state.iteration,
    from: state.phase,
    to: state.phase,
    outcome: "paused",
    note: `plan usage limit — waited ${seconds}s${extendedBy ? `, deadline extended by ${extendedBy}s` : ", deadline NOT extended (wait cap reached)"}`,
    ended_at: new Date().toISOString(),
  });
  writeState(state);
  console.log(
    `paused for usage limit: waited ${seconds}s (total ${waitedSoFar}s of ${cap}s cap)${extendedBy ? `, deadline -> ${state.deadline_at}` : ""}`,
  );
  return 0;
}

/** True when the loop has already spent its whole allowance of waiting. */
function limitWaitBudgetLeft() {
  const state = readState();
  if (!state) return 1;
  const cap = state.guards.max_limit_wait_seconds ?? 6 * 3600;
  const used = state.guards.limit_wait_seconds ?? 0;
  console.log(String(Math.max(0, cap - used)));
  return 0;
}

/**
 * The loop's only stop authority. Bash asks this before every iteration so the
 * guards live in one place instead of being re-implemented in shell.
 */
function shouldContinue() {
  const state = readState();
  if (!state) {
    console.log("STOP: no STATE.json");
    return 1;
  }
  if (state.phase === "DONE") {
    console.log("STOP: phase is DONE");
    return 1;
  }
  if (Date.now() > Date.parse(state.deadline_at)) {
    /**
     * The deadline does not kill the run — it routes it to REPORT. A night that
     * ends with findings on disk and no write-up wasted the night.
     */
    if (state.phase === "REPORT") {
      console.log("CONTINUE: past deadline, finishing the report");
      return 0;
    }
    const interrupted = state.phase;
    state.phase = "REPORT";
    state.next_phase = null;
    state.history.push({
      iteration: state.iteration,
      from: interrupted,
      to: "REPORT",
      outcome: "ok",
      note: "deadline reached, routing to REPORT",
      ended_at: new Date().toISOString(),
    });
    writeState(state);
    console.log("CONTINUE: deadline reached -> forcing REPORT");
    return 0;
  }
  const { total_usd, spent_usd } = state.budget;
  if (total_usd > 0 && spent_usd >= total_usd && state.phase !== "REPORT") {
    state.phase = "REPORT";
    writeState(state);
    console.log(`CONTINUE: budget $${spent_usd}/$${total_usd} exhausted -> forcing REPORT`);
    return 0;
  }
  if (state.guards.consecutive_failures >= state.guards.max_consecutive_failures) {
    if (state.phase === "REPORT") {
      console.log("STOP: report phase itself keeps failing");
      return 1;
    }
    state.phase = "REPORT";
    writeState(state);
    console.log("CONTINUE: too many consecutive failures -> forcing REPORT");
    return 0;
  }
  console.log(`CONTINUE: phase=${state.phase} iteration=${state.iteration}`);
  return 0;
}

function summary() {
  const state = readState();
  if (!state) {
    console.log("not initialised");
    return 1;
  }
  const queue = readJson(QUEUE, { candidates: [], confirmed: [], fixed: [], escalated: [], rejected: [] });
  const remaining = Math.round((Date.parse(state.deadline_at) - Date.now()) / 60_000);
  console.log(
    [
      `run        ${state.run_id}`,
      `phase      ${state.phase}   iteration ${state.iteration}`,
      `deadline   ${state.deadline_at} (${remaining} min left)`,
      `usage      ${state.budget.spent_usd} / ${state.budget.total_usd || "unlimited"} plan-units (notional estimate, NOT money — see docs/nightly-loop.md)`,
      `guards     failures=${state.guards.consecutive_failures} fix_attempts=${state.guards.fix_attempts} hunt_rounds=${state.guards.hunt_rounds}`,
      `limits     waits=${state.guards.limit_waits ?? 0} waited=${Math.round((state.guards.limit_wait_seconds ?? 0) / 60)}min of ${Math.round((state.guards.max_limit_wait_seconds ?? 21600) / 60)}min cap`,
      `queue      candidates=${queue.candidates.length} confirmed=${queue.confirmed.length} fixed=${queue.fixed.length} escalated=${queue.escalated.length} rejected=${queue.rejected.length}`,
      `current    ${state.current_bug_id ?? "-"}`,
    ].join("\n"),
  );
  return 0;
}

const COMMANDS = {
  init,
  get,
  set,
  "begin-iteration": beginIteration,
  "end-iteration": endIteration,
  "note-limit-wait": noteLimitWait,
  "limit-wait-budget-left": limitWaitBudgetLeft,
  "should-continue": shouldContinue,
  summary,
};

const [command, ...args] = process.argv.slice(2);
if (!COMMANDS[command]) {
  console.error(`Usage: state.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(64);
}
process.exit(COMMANDS[command](args) ?? 0);
