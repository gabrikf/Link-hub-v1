## PHASE: REGRESSION — prove the night did not break anything

Every confirmed bug has been fixed and approved. Before the report, prove the
tree is better than you found it and not merely different.

### Do this

1. **The full gate**, recorded verbatim:

   ```bash
   npm run build:schemas
   node scripts/guardrails/pre-push.mjs
   ```

   Note which lanes it says it skipped and why. A narrowed run that announces
   what it narrowed is honest; a narrowed run reported as "all green" is a lie.

2. **The whole e2e suite**, both projects:

   ```bash
   npx playwright test --project=desktop --reporter=list
   npx playwright test --project=mobile --reporter=list
   ```

3. **The unit and integration suites**, per workspace:

   ```bash
   npm run test --workspace=api
   npm run test --workspace=web
   npm run test --workspace=@repo/schemas
   npm run test --workspace=crafthub-extract
   ```

4. **Compare against the BOOTSTRAP baseline in MEMORY.md.** This is the whole
   point of the phase. For every test that changed state:
   - was failing → now passing: expected, name the fix that did it.
   - was passing → **now failing**: this is a regression the night caused. It
     outranks every other item. Add it to `QUEUE.candidates` with severity
     `blocker`, claim it, and set `next_phase` to `TRIAGE`.
   - still failing: was it a bug we chose to escalate, or did a fix not land?

5. **Re-walk each fixed bug's reproduction one final time** from a real entry
   point, in both themes where a browser is involved. A test suite can be green
   over a broken screen.

6. **Sanity-check the diff as a whole**:
   ```bash
   git log --oneline develop..nightly/qa-hardening
   git diff --stat develop..nightly/qa-hardening
   ```
   Every commit should be a `test(BUG-…)` / `fix(BUG-…)` pair or a deliberate
   harness commit. Anything else is scope creep that got through review —
   record it prominently for the morning.

### Record

Write the full results into MEMORY.md under `## Iteration N — REGRESSION`, with
the baseline-vs-now comparison as a table. Update each `QUEUE.fixed[]` entry with
`regression: "verified"` or the reason it is not.

### Then stop

```bash
node scripts/nightly/state.mjs set next_phase '"REPORT"'
```

Legal: `REPORT` (clean), `TRIAGE` (you found a regression — it must be triaged
and fixed before the report), `FIX` (a regression is obvious and already
claimed).
