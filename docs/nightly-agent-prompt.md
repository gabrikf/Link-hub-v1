# The supervised alternative to the loop

Paste the block below into a **fresh Claude Code session** in this repo. It does
the same job as `scripts/nightly/run.sh` but as one supervised session that
fans out to subagents, so you can watch it and interrupt.

**When to use which**

| | Nightly loop | This prompt |
|---|---|---|
| Runs | Unattended, 8h, fresh process per phase | One session you watch |
| Context | Reset structurally each iteration | Degrades as it runs — expect to `/compact` |
| Survives a plan-limit reset | Yes, waits and resumes | No, you restart it |
| Best for | Overnight | An hour or two while you're around |

Both read and write the same `.nightly/QUEUE.json`, so they interoperate: run
the loop overnight, then use this to finish anything it escalated.

---

```
Work through CraftHub's QA backlog on the current branch (nightly/qa-hardening).
Use subagents aggressively — you are the coordinator, not the worker.

START BY READING, in this order:
  cat .nightly/QUEUE.json     # 7 confirmed bugs, 10 candidates, seed_baseline
  cat .nightly/MEMORY.md      # what earlier work learned; APPEND, never rewrite
  cat AGENTS.md               # project law, overrides your defaults
  cat docs/nightly-loop.md    # how this queue was built and what the guards are

PRECONDITIONS (verify, do not assume):
  - api :3333 and web :5173 are already running. Do not restart them.
  - node scripts/guardrails/pre-push.mjs must PASS before you start. If it is
    red, fix that first — a red gate trips the Stop hook on every stop, and a
    blocked agent starts editing unrelated code to get past it. That has already
    happened once in this repo; do not let it happen again.
  - No MCP servers. Query the database with:
      docker exec crafthub-postgres-dev psql -U crafthub_user -d crafthub_dev -c "SELECT ..."

THE BAR — this is the whole point. A finding is only a bug if you can name the
user, the action, and the harm. File data loss, blocked flows, privacy leaks,
crashes, wrong numbers, dead controls, a public profile broken on a phone,
request storms, and unbounded paid-API calls. Do NOT file style preferences,
refactors, test-harness problems, the recorded debt listed in AGENTS.md, or i18n
gaps (there is no i18n here, by decision). When in doubt, do not file it. Four
real fixes beat twenty cosmetic ones the night before a deploy.

WORK THE QUEUE IN THIS ORDER — blockers, then majors, cheapest-and-safest first
within a tier. For EACH bug, one at a time:

  1. Reproduce it yourself from a real entry point. Cannot reproduce -> move it
     to rejected[] with reason "not-reproducible" and go to the next one.

  2. RED TEST FIRST. Write the test at the layer QUEUE.json's test_plan names.
     Vitest everywhere (there is no jest); a whole journey goes in e2e/journeys/
     as a Playwright spec. RUN IT AND WATCH IT FAIL, and confirm it fails for
     the bug's actual symptom — not a typo, missing import or bad selector. A
     test that fails for the wrong reason proves nothing and will go green by
     accident. Commit ONLY the test:
       git commit -m "test(<BUG-ID>): failing regression test for <symptom>"

  3. Fix the CAUSE, not the symptom. No type assertion, no eslint-disable, no
     .skip, no widened zod schema, no swallowed error, no timing hack. If a
     shape crossing api<->web<->mcp changes, change packages/schemas FIRST, run
     npm run build:schemas, then the api handler, then the web caller. Never
     widen a schema so a bad payload passes. If the honest fix is out of scope,
     move the bug to escalated[] with a recommendation and move on — that is a
     good outcome, not a failure.

  4. Watch the test pass, then run the gate:
       npm run build:schemas && node scripts/guardrails/pre-push.mjs
     Commit the fix separately:
       git commit -m "fix(<BUG-ID>): <what changed, in user words>"

  5. REVIEW IT WITH A FRESH SUBAGENT that did not write the fix. Give it the bug
     entry and both SHAs and tell it to find why this should not ship. It must
     verify red-before-green mechanically, not trust the commit message:
       git checkout <red_commit>  -> the test MUST FAIL here
       git checkout nightly/qa-hardening -> it MUST PASS
     Reject if the test passes at the red commit (it does not detect the bug),
     if it failed there for the wrong reason, if a schema was widened, if an
     existing test was edited to make the fix pass, if there is scope creep, or
     if the user-visible symptom survives. On reject, hand the feedback to a NEW
     fix subagent — do not let the original author defend its own work. After
     three rejections, escalate the bug and move on.

  6. Update QUEUE.json (status, red_commit, fix_commit, test_paths) and append
     what the CAUSE actually was to MEMORY.md. That note is the most valuable
     thing you leave behind.

SUBAGENT FAN-OUT — use it for these, 3-5 at a time, each returning evidence
rather than opinions, each given the bar above verbatim:
  - reproducing several candidates in parallel
  - hunting new bugs in one lane at a time: perf/cost (measure request counts,
    N+1 queries, unbounded OpenAI calls, re-renders — numbers or it did not
    happen), responsive+dark at 390px and 1440px in both themes, disclosure
    leaks (the highest-value class here), or the five journeys probed harder
    than their specs
  - reviewing fixes (always a different subagent than the author)
Never let a subagent both write and approve the same fix.

WHEN THE CONFIRMED QUEUE IS EMPTY:
  npx playwright test --project=desktop --reporter=list
  npx playwright test --project=mobile  --reporter=list
  npm run test --workspace=api && npm run test --workspace=web
  node scripts/guardrails/pre-push.mjs
Compare against QUEUE.json's seed_baseline: 42 e2e tests, 32 passed, 9 failed,
1 skipped, with 7 of those failures mapped to bug ids there. Exactly those 7
gone and nothing new means the work landed. Anything that flipped from passing
to failing is a regression YOU caused and outranks everything else.
Two tests are known-flaky under a full run (CAND-0110) — do not chase them as
product bugs.

FINISH by appending a "## Run <date> — results and gains" section to
docs/nightly-loop.md: what was fixed with both SHAs per bug, what was rejected
and why, what was escalated with a recommendation, real measured numbers, what
you did NOT verify, and a plain SHIP / SHIP WITH KNOWN ISSUES / DO NOT SHIP
verdict with the evidence for it.

RULES THAT DO NOT BEND: stay on nightly/qa-hardening, never touch main or
develop, never push. Do not edit an existing test to make a change pass. Do not
"clean up" anything you are not fixing. If you report something is done, it must
be something you actually saw work.
```
