## PHASE: REPORT — write the morning briefing

You are the last iteration. The person reading your output has to decide, over
coffee, whether to deploy. Write for that decision.

You may be here because the night finished cleanly, or because the deadline hit,
the budget ran out, or the loop kept failing. **Say which**, up front. A report
that hides an incomplete night is the most expensive kind of wrong.

### Write two documents

**1. `docs/qa/reports/<YYYY-MM-DD>-nightly.md`** — the QA round, in the format
the `/qa-report` skill's tree expects. Read the tree's existing report template
first and follow it. It carries the session ledger, the bug registry updates,
root causes, and the release-readiness verdict.

**2. `docs/nightly-loop.md`** — this file ALREADY EXISTS and describes the loop's
design. **Append** a new `## Run <YYYY-MM-DD> — results and gains` section to
it; do not rewrite the design sections above it. Your section must contain:

- **Which guards actually fired** this run: per-iteration cost cap,
  per-iteration timeout, deadline→REPORT routing, three-strikes fix escalation,
  three-strikes loop failure, illegal-phase-transition refusal. Read
  `.nightly/STATE.json` → `history[]` for the evidence; a guard that never fired
  should say so.
- **Whether the phase machine behaved** — any iteration that failed, timed out,
  or proposed an illegal transition, and what it cost.
- **What it found**, as a table: bug id, severity, area, user impact, the two
  commit SHAs, and whether review approved it first time or rejected it first.
- **What it rejected and why.** Equally important. This is the evidence that the
  loop held the "real user impact" bar instead of churning cosmetics.
- **What it escalated** — the decisions left for a human, each with options and
  a recommendation.
- **The gains, measured.** Iterations run, wall-clock, total cost, bugs found
  per lane, review rejection rate, tests added, baseline-vs-final test counts.
  Real numbers from `.nightly/STATE.json` history and MEMORY.md — never
  estimates. If a number is not available, say so rather than inventing it.
- **What it did NOT verify**, and why. Blocked legs, skipped gate lanes, lanes
  never run, areas never walked. Not optional.
- **How to run it again**, and what you would change about the loop itself.

### Deploy verdict

End `docs/nightly-loop.md` with a plain-language verdict in one of three forms,
and the evidence for it:

- **SHIP** — the journeys walk clean, the gate is green, no blocker or major is
  open.
- **SHIP WITH KNOWN ISSUES** — list exactly what the user is shipping with.
- **DO NOT SHIP** — name the blocker and what it would take to clear it.

### Finish

```bash
git add docs/ .nightly/ 2>/dev/null; git add -A docs/
git commit -m "docs(nightly): QA round report and loop retrospective"
node scripts/nightly/state.mjs set next_phase '"DONE"'
```

Then print, as your final message, a short summary a human can read in thirty
seconds: the verdict, the count of bugs fixed / escalated / rejected, and the
one thing they should look at first.
