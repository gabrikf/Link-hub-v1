## PHASE: BOOTSTRAP — establish the baseline

You run once, at the start of the night. Everything after you trusts what you
record here, so record what you actually observed, not what you expected.

### Do this

1. **Prove the preconditions.** Run each and record the real output:
   ```bash
   npm run build:schemas
   bash db-manage.sh status
   curl -fsS http://localhost:3333/docs > /dev/null && echo "api ok"
   curl -fsS http://localhost:5173 > /dev/null && echo "web ok"
   node scripts/guardrails/pre-push.mjs
   ```
   The gate's result is the night's baseline. If it is already red **on code you
   did not touch**, that is the single most important fact of the night: record
   it verbatim in MEMORY.md and note which lanes the gate said it skipped
   (no docker → no Postgres tests; no `OPENAI_API_KEY` → no live-embedding
   tests). A narrowed run that announces what it narrowed is honest; do not
   silence those notices.

2. **Baseline the e2e suite.**
   ```bash
   npx playwright test --project=desktop --reporter=list
   npx playwright test --project=mobile --reporter=list
   ```
   Record, per spec file, which tests pass and which fail. **Do not fix
   anything.** A failing e2e test written before tonight is a *candidate*, not a
   verdict — TRIAGE decides. Add each distinct failure to `QUEUE.candidates`.

3. **Baseline the unit/integration suites**, so later phases can tell a
   regression from pre-existing red:
   ```bash
   npm run test --workspace=api 2>&1 | tail -40
   npm run test --workspace=web 2>&1 | tail -40
   npm run test --workspace=@repo/schemas 2>&1 | tail -20
   ```
   Record pass/fail counts per workspace in MEMORY.md.

4. **Bootstrap the living QA docs tree** if `docs/qa/` does not exist. Invoke
   the project skill `/qa-report` and let it own the tree's structure —
   personas, journeys, session charters, the bug registry. Do not invent your
   own layout. If the tree already exists, read its README and leave it alone.

5. **Record the baseline** in MEMORY.md under a new `## Iteration N — BOOTSTRAP`
   heading: gate result, e2e pass/fail per file, unit-test counts per
   workspace, and anything that surprised you.

### Queue format

Append candidates to `.nightly/QUEUE.json` → `candidates[]`:
```json
{
  "id": "CAND-0001",
  "title": "short symptom, user-facing words",
  "source": "e2e-baseline | unit-baseline | gate",
  "area": "auth | posts | search | profile | layout | settings | mcp | api | infra",
  "evidence": "exact command + the failing assertion or output, trimmed",
  "first_seen_iteration": N
}
```

### Then stop

```bash
node scripts/nightly/state.mjs set next_phase '"HUNT"'
```
Legal next phases: `HUNT`, `REPORT` (use REPORT only if the app is so broken
that no session can run — say exactly why).
