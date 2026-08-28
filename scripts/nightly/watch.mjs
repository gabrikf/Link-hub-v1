#!/usr/bin/env node
/**
 * READ-ONLY dashboard for a nightly run. Answers the only two questions that
 * matter while it is working: is it alive, and is it producing anything.
 *
 * Deliberately a SEPARATE file from run.sh. Bash reads a script lazily as it
 * executes, so editing run.sh mid-run can corrupt the running process. This
 * touches nothing — it reads state files, git, and the log.
 *
 *   node scripts/nightly/watch.mjs          one snapshot
 *   node scripts/nightly/watch.mjs --follow refresh every 30s
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DIR = resolve(ROOT, ".nightly");
const LOG = process.env.NIGHTLY_LOG || "/tmp/nightly.log";

const read = (p, fallback = null) => {
  try {
    return JSON.parse(readFileSync(resolve(DIR, p), "utf8"));
  } catch {
    return fallback;
  }
};

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const minutes = (ms) => Math.round(ms / 60_000);

function render() {
  const state = read("STATE.json");
  if (!state) {
    console.log("No .nightly/STATE.json — the loop has not started.");
    return;
  }
  const queue = read("QUEUE.json", { candidates: [], confirmed: [], fixed: [], escalated: [], rejected: [] });

  const alive = sh("pgrep", ["-f", "nightly/run.sh start"]).length > 0;
  const working = sh("pgrep", ["-f", "claude -p"]).length > 0;
  const started = Date.parse(state.started_at);
  const deadline = Date.parse(state.deadline_at);

  const line = "─".repeat(66);
  console.log(`\n${line}`);
  console.log(
    `  ${alive ? "● RUNNING" : "○ NOT RUNNING"}   phase ${state.phase}   iteration ${state.iteration}` +
      `${working ? "   (an agent is working now)" : ""}`,
  );
  console.log(
    `  elapsed ${minutes(Date.now() - started)}min   remaining ${minutes(deadline - Date.now())}min` +
      `   usage ${state.budget.spent_usd} plan-units`,
  );
  console.log(line);

  /* ---- is it producing anything? ------------------------------------- */
  const fixed = queue.fixed?.length ?? 0;
  const confirmed = queue.confirmed?.length ?? 0;
  console.log(
    `\n  RESULTS   fixed ${fixed}   still open ${confirmed}   escalated ${queue.escalated?.length ?? 0}` +
      `   rejected ${queue.rejected?.length ?? 0}   new candidates ${queue.candidates?.length ?? 0}`,
  );

  for (const bug of queue.fixed ?? []) {
    console.log(`    ✔ ${bug.id} [${bug.severity}] ${bug.review?.verdict ?? ""}`);
  }
  for (const bug of queue.confirmed ?? []) {
    const mark = bug.status === "fixed-pending-review" ? "◐" : bug.status === "fix-rejected" ? "✗" : "·";
    console.log(`    ${mark} ${bug.id} [${bug.severity}] ${bug.status}`);
  }

  /* ---- commits are the hard evidence --------------------------------- */
  const commits = sh("git", ["log", "--oneline", "develop..nightly/qa-hardening"]);
  const newOnes = commits.split("\n").filter((l) => /^\w+ (test|fix)\(BUG-/.test(l));
  console.log(`\n  COMMITS   ${newOnes.length} test/fix commits on the branch`);
  for (const c of newOnes.slice(0, 10)) console.log(`    ${c}`);

  /* ---- how the phase machine has moved ------------------------------- */
  const history = (state.history ?? []).slice(-6);
  if (history.length) {
    console.log("\n  RECENT PHASES");
    for (const h of history) {
      console.log(
        `    #${h.iteration} ${h.from} → ${h.to}  ${h.outcome}` +
          `${h.cost_usd ? `  ${h.cost_usd}u` : ""}${h.note ? `  (${h.note})` : ""}`,
      );
    }
  }

  /* ---- guards worth knowing about ------------------------------------ */
  const g = state.guards ?? {};
  if (g.consecutive_failures || g.limit_waits || g.fix_attempts) {
    console.log(
      `\n  GUARDS    failures ${g.consecutive_failures}   fix attempts ${g.fix_attempts}` +
        `   plan-limit waits ${g.limit_waits ?? 0} (${Math.round((g.limit_wait_seconds ?? 0) / 60)}min)`,
    );
  }

  if (existsSync(LOG)) {
    const tail = readFileSync(LOG, "utf8").trimEnd().split("\n").slice(-4);
    console.log("\n  LOG TAIL");
    for (const l of tail) console.log(`    ${l}`);
  }
  console.log("");
}

render();
if (process.argv.includes("--follow")) {
  setInterval(render, 30_000);
}
