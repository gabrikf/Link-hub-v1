## PHASE: TRIAGE — decide what is worth fixing tonight

You are the gate between "something looked wrong" and "we are changing
production code the night before a deploy". Be strict. Rejecting a candidate is
a normal, good outcome.

### Do this

1. **Reproduce every candidate yourself.** A candidate you cannot reproduce is
   `rejected` with reason `not-reproducible`. Do not take a previous
   iteration's word for it — that is how a night gets spent fixing a flake.

2. **Judge each one against the bar.** For each candidate, answer in writing:
   - Who is the user, what were they doing, what harm did they take?
   - Would they notice? Would they be blocked, lose data, or be exposed?
   - Is this already recorded debt in AGENTS.md? → `rejected`, reason `recorded-debt`.
   - Is it a test/harness problem rather than a product problem? → `rejected`,
     reason `harness` (but note it in MEMORY.md so the suite gets fixed later).
   - **Is the fix riskier than the symptom?** The deploy is tomorrow. A
     one-line, well-tested fix to a broken flow is worth it. A refactor of the
     layout editor to fix a 2px misalignment is not. → `escalated` with a
     recommendation, not `confirmed`.

3. **Assign a severity** to everything you confirm:
   - `blocker` — a journey cannot be completed, data is lost, or something
     private leaks. Fix tonight, first.
   - `major` — a real user hits it on a normal path and is materially degraded
     (wrong data shown, broken on mobile, a paid-API or request storm).
   - `minor` — real but survivable. Fix only if the night has time left after
     every blocker and major is done.
   Anything below `minor` is `rejected`. There is no `trivial` tier tonight.

4. **Order the confirmed queue**: blockers first, then majors, then minors.
   Within a tier, cheapest-and-safest fix first — momentum matters and each
   fix must survive review.

5. **Pick the next bug** and claim it:
   ```bash
   node scripts/nightly/state.mjs set current_bug_id '"BUG-YYYYMMDD-slug"'
   ```

6. **File confirmed bugs into the living QA docs** bug registry under `docs/qa/`
   following the `/qa-report` skill's registry format, so the morning review has
   them in the project's own words and not only in `.nightly/`.

### Queue format

Move each candidate into exactly one of `confirmed[]`, `rejected[]`,
`escalated[]`. Confirmed entries carry:
```json
{
  "id": "BUG-20260822-layout-loses-blocks",
  "title": "…",
  "severity": "blocker | major | minor",
  "area": "…",
  "user_impact": "who is hurt and how",
  "reproduction": ["step 1 from a real entry point", "step 2", "…"],
  "expected": "…",
  "observed": "…",
  "evidence": ".nightly/evidence/…",
  "suspected_cause": "file:line if you know it, else null",
  "test_plan": "which test, at which layer, would fail today",
  "status": "confirmed"
}
```
`test_plan` matters: FIX must write a test that **fails before the fix**, so
triage decides where that test belongs. Use the repo's own map — pure business
rule next to the use case in `apps/api/src/core/**`; HTTP behaviour through
`build-test-app.ts` + `server.inject`; contract via `.parse()` of a real payload
through `@repo/schemas`; component behaviour with `@testing-library/react`; a
whole journey as a Playwright spec under `e2e/journeys/`.

### Then stop

```bash
node scripts/nightly/state.mjs set next_phase '"FIX"'
```
Legal: `FIX` (a confirmed bug is claimed), `HUNT` (nothing confirmed and there
is time to look harder), `REGRESSION` (everything confirmed is now fixed),
`REPORT` (out of time).
