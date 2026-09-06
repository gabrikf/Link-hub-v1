# Verification — The Convergence Model

Internal reference for `#spec-implement` — the verification cycle during and after implementation.

---

## Model: Verify-Fix-Verify Loop

Every task follows the cycle below. Never advance to the next task with a failure outstanding.

```
IMPLEMENT
    │
    ▼
VERIFY (automated)
    │
    ├── pass → COMMIT → next task
    │
    └── fail → DIAGNOSE
                    │
                    ▼
                 FIX (targeted)
                    │
                    ▼
                 RE-VERIFY
                    │
                    ├── pass → COMMIT
                    └── fail → back to DIAGNOSE
                              (max 3 iterations, then escalate)
```

**Three-attempt rule:** if the problem survives 3 fix+verify cycles, stop and report to the dev with a detailed diagnosis. Do not loop forever.

---

## Level 0: The G0 Gate (before any dependent task)

Blocking, and it runs before UI work against any endpoint someone claims already exists. See SKILL.md §2.4 for the full procedure. The short form:

```bash
# 0. Is the API up at all?
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3333/health

# 1. What does Swagger actually declare? (the authoritative route list)
curl -sS http://localhost:3333/docs/json | jq -r '.paths | keys[]' | grep -i '<resource>'

# 2. Probe BOTH registrations and demand real JSON
for base in "http://localhost:3333" "http://localhost:3333/api/v1"; do
  echo "--- $base/<resource>"
  curl -sS -D- -o /tmp/probe-body.json \
       -H 'Accept: application/json' \
       -H "Authorization: Bearer $TOKEN" \
       "$base/<resource>" \
    | grep -iE '^(HTTP/|content-type:)'
  jq -e . /tmp/probe-body.json >/dev/null \
    && echo "OK: body is valid JSON" \
    || echo "BLOCKED: body is not JSON — this route is not live"
done

# 3. Freeze the real payload as the fixture
cp /tmp/probe-body.json docs/specs/[feature]/contracts/fixtures/<endpoint>.example.json
```

**Pass requires all four:** 2xx, `content-type: application/json`, a body that parses, and a body the schema in `contracts/` accepts. Probe **both** registrations — bare and `/api/v1` — because a module can be live on one and 404 on the other. Probe port **3333 directly**: a request through the web dev server at 5173 can return the SPA's `index.html` at HTTP 200, and a 200 is not proof of an endpoint.

**On failure: BLOCK.** Report which demand failed on which registration, then either flip the contract to INFERRED + mock + validation task, or correct the spec's route table.

---

## Checks by Level

### Level 1: After Every Task (mandatory)

```bash
# The contract package — everything types against dist/
npm run build:schemas

# Type-check — the real CI gate
npm run check-types

# Lint the changed files, ratcheted (fails on NEW findings, not the backlog)
node scripts/guardrails/lint-changed.mjs

# Only the suites that touch what you changed
npx vitest related <changed-file> --run
```

**If `build:schemas` is skipped:** `check-types` fails on a fresh tree against a stale `dist/`, for reasons unrelated to your code. Always build first.

**If `check-types` fails:**

1. Read the full error
2. Decide whether it is in the new code or a cascade into existing code
3. New code → fix the type/interface
4. Cascade → check whether you changed the public shape of something shared (a `packages/schemas` export reaches api, web, mcp, extractor and training)

**If `lint-changed.mjs` fails:** it is a NEW finding in your diff — fix the code, never disable the rule. The repo's pre-existing backlog (~30 eslint errors in `apps/web`, no eslint history in `apps/api`) is deliberately excluded and is **not yours to fix here**.

**If a test fails:**

1. Identify which one
2. Is it a new test (yours)? → fix the test or the implementation
3. Is it an existing test? → your change broke something → revert and rethink
4. NEVER modify an existing test that is not yours without explicit permission

**Beware the slow suites.** These do not fail fast when their infrastructure is missing — they hang for 60-90s:

- Need docker Postgres/pgvector (`bash db-manage.sh start`):
  `apps/api/src/infra/di/container-wiring.test.ts`,
  `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`,
  `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`
- Need a funded `OPENAI_API_KEY` (excluded from CI by name):
  `apps/api/src/infra/http/controllers/resume/test/search.e2e.test.ts`,
  `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`,
  `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`

Most api tests are hermetic through `apps/api/src/infra/http/test-support/build-test-app.ts` (in-memory repositories plus `server.inject` — no socket, no database). Web tests use `@testing-library/react` with jsdom. Everything is **vitest**, never jest.

---

### Level 2: The Contract Sensor (whenever a task touches an API response)

The strongest sensor in this repo.

```ts
import { describe, it, expect } from "vitest";
import { profileBlockSchema } from "@repo/schemas";
import realPayload from "../../docs/specs/[feature]/contracts/fixtures/get-blocks.example.json";

describe("GET /profile-blocks contract", () => {
  it("parses the real captured payload", () => {
    expect(() =>
      profileBlockSchema.array().parse(realPayload.full),
    ).not.toThrow();
  });

  it("accepts the empty case", () => {
    expect(() =>
      profileBlockSchema.array().parse(realPayload.empty),
    ).not.toThrow();
  });

  it("reports drift instead of crashing on the missing-field case", () => {
    const result = profileBlockSchema
      .array()
      .safeParse(realPayload.missingField);
    expect(result.success).toBe(false);
  });
});
```

**The "full" fixture must be a real captured payload** — frozen by the G0 probe. A fixture you hand-wrote agrees with the code you hand-wrote; it proves nothing and will happily pass while production drifts.

Drift then surfaces as a parse failure or a type error, rather than a silent runtime bug three screens away.

---

### Level 3: The Schema ⟷ UI Sensor (per applicable mode/tab)

Two halves, both required. This is what connects the contract to the pixels.

**Half 1 — parse:** the real captured payload parses through the zod schema in `packages/schemas/src/<module>/`.

**Half 2 — render:** a UI test renders the component from **that same parsed fixture** — not from a separately hand-written object.

```ts
const parsed = profileBlockSchema.array().parse(realPayload.full);

it.each(["pc", "mobile"] as const)("renders every block in %s mode", (mode) => {
  render(<BlockList blocks={parsed} viewport={mode} />);
  // assertions per the variants.md row
});
```

If the fixture and the render disagree, the test fails instead of production. Two hand-written objects, one for the parse test and one for the render test, is the failure mode this sensor exists to prevent — they drift apart and both keep passing.

**Half 3 — field coverage (for any screen with a form):** every **required** field of the schema has a mounted input **in every mode/tab where it applies**, per the task's field table (field → schema key → payload path → tab/mode).

```ts
it.each(fieldTable)("mounts $field in $mode", ({ schemaKey, mode }) => {
  render(<BlockForm mode={mode} />);
  expect(screen.getByRole("textbox", { name: labelFor(schemaKey) })).toBeInTheDocument();
});
```

A required field with no input in the mode that requires it is a **dead Save button by construction**: the form can never validate, the user gets no error pointing at anything they can see, and manual clicking will not reveal which field is missing. This sensor catches it at the task, not at QA.

---

### Level 4: The Variant Matrix (if the feature renders a discriminated set)

1. Run the table-driven test over every row of `variants.md`
2. Check against the matrix: every variant marked "appears on this screen" has a green test
3. Explicitly test the **unknown** variant → shows "unsupported", **never** crashes, never blanks
4. **Report the matrix** as `variant × (parse | render | submit)`:

```markdown
| Variant | parse | render                          | submit |
| ------- | ----- | ------------------------------- | ------ |
| links   | pass  | pass                            | pass   |
| video   | pass  | pass                            | n/a    |
| unknown | pass  | pass ("unsupported block type") | n/a    |
```

Enumerate the variants **from the zod enum** in `packages/schemas/src/`, not from memory. **Refuse the delivery** if an affected variant was not covered.

---

### Level 5: Resilience (every new screen)

1. A test that forces a `throw` inside the component → the error boundary fallback renders and `body` is not empty
2. A test with the API returning 500 → the error state with a retry affordance
3. A test with the API returning an empty list → the empty state
4. A test with the "missing-field" fixture → it does not crash; the drift is reported and the screen stays up

---

### Level 6: The Write-Landed Check (every mutation)

A 200 is not proof that anything was persisted. After an action that writes, query the target table through **postgres-mcp** (`crystaldba/postgres-mcp`, `--access-mode=restricted`, pointed only at the local dev database) by a **correlation id** taken from the response, and assert the row is there with the expected values.

```
1. Perform the action (UI or API), capture the returned id
2. postgres-mcp: SELECT the row by that id from the target table
3. Assert: the row exists, and the fields the action was supposed to set hold the expected values
4. For a delete/soft-delete: assert the row is gone, or the flag is set
```

Without this, "the request succeeded" and "the data is saved" are two different claims and you only checked the first.

---

### Level 7: Visual (per delivery, after UI tasks)

**Cadence: per task/delivery, never only at the end.** A single late visual pass is how a whole delivery's worth of wrong units, mis-rendered blocks and states that never mounted get discovered at once — long after the cheap moment to fix them.

```bash
node scripts/visual/session.mjs login
node scripts/visual/run.mjs scripts/visual/scenarios/[feature].scenario.mjs
```

One browser launch walks every state and fails on console errors, uncaught exceptions, and 4xx/5xx that were not deliberately mocked.

Checklist against the design:

```markdown
- [ ] Overall layout matches (grid, columns, regions)
- [ ] Spacing correct (Tailwind scale)
- [ ] Colours correct (`DESIGN.md` violet/zinc tokens, `SURFACE*` constants — no hex)
- [ ] Typography (size, weight, family)
- [ ] Icons present and correct (react-icons `fi`)
- [ ] Borders, shadows, radii — from the SURFACE constants, not re-invented
- [ ] Focus rings per `DESIGN.md` on every interactive element
- [ ] Dark mode intact (the surface constants carry `dark:` variants)
- [ ] Alignment
- [ ] Hover/focus/active states (if in the design)
- [ ] Responsive behaviour
- [ ] Every mode/tab from `variants.md`
```

**Tolerance:** 1-2px differences are acceptable. A wrong colour, a wrong component, or a fundamentally different layout → fix it.

---

### Level 8: Copy (after UI tasks)

Run `npm run i18n:check`. Parity proves the same key set exists in all three locales with no empty values; the raw-string half proves the string became a key at all. Both run in the gate.

Check instead:

- Every user-visible string matches the copy table in `definitions.md`
- Every user-visible string goes through `t()`, and every new key is in all three locale files
- No leftover placeholder or lorem text
- No raw enum value or id leaking where a human-readable label belongs

---

### Level 9: Final Convergence (after ALL tasks)

The one-shot gate — the same script husky's pre-push hook and the Claude Code Stop hook run:

```bash
node scripts/guardrails/pre-push.mjs
```

Or the individual sensors:

```bash
npm run build:schemas
npm run check-types
node scripts/guardrails/lint-changed.mjs
npm run test --workspace=web
npm run test --workspace=api
npm run test --workspace=@repo/schemas
npm run test:coverage        # ratchet — per-package floors may only go UP; target 70
```

**On coverage:** the floors sit at the measured baseline and may only rise. Coverage is a flashlight, not a correctness gate — a fully covered function can still be wrong. Pair it with the contract sensor (Level 2), which is the one that actually catches drift.

**Final checklist — before opening the PR:**

- [ ] `node scripts/guardrails/pre-push.mjs` green
- [ ] G0 passed for every endpoint claimed to exist; real payload frozen in `contracts/fixtures/`
- [ ] Contract sensor green against the REAL payload
- [ ] Schema ⟷ UI sensor green per applicable mode/tab; every required field mounted
- [ ] Variant matrix green and reported (Level 4)
- [ ] Resilience tests green (Level 5)
- [ ] Write-landed check green for every mutation (Level 6)
- [ ] Visual scenario green per delivery, not just at the end (Level 7)
- [ ] Copy matches `definitions.md`; no invented `t()` (Level 8)
- [ ] Every business rule in `definitions.md` has a test
- [ ] Inferred contracts still marked `Status: PENDING`, with their validation task open
- [ ] `git diff` reviewed line by line for `any`, `catch {}`, hardcoded hex, and unparsed responses

---

## Acceptance Criteria Verification

After convergence, check each AC in SPEC.md against the implementation.

### Process:

1. Re-read SPEC.md §3 (Functional Requirements)
2. For each FR-XX:
   - Locate where the requirement is implemented
   - Confirm the "WHEN...THEN...SHALL" is covered
   - If there is a test → confirm it tests that scenario
   - If there is no test → write one
3. Mark it verified, or record the gap

### Report template:

```markdown
## Acceptance Criteria — Verification

| ID    | Criterion                                                 | File(s)           | Test                   | Status  |
| ----- | --------------------------------------------------------- | ----------------- | ---------------------- | ------- |
| AC-01 | WHEN the user saves THEN the block persists               | block-form.tsx:45 | block-form.test.tsx:23 | pass    |
| AC-02 | WHEN the list is empty THEN the empty state shows         | block-list.tsx:78 | block-list.test.tsx:45 | pass    |
| AC-03 | IF the visitor is anonymous THEN edit controls are hidden | block-list.tsx:12 | —                      | no test |
```

---

## Cross-Dependency Check

After implementing, verify nothing outside the feature broke.

```bash
# Who imports what you changed?
grep -rn "from \"@/shared-components/" apps/web/src --include="*.tsx" | grep -v "[feature]"

# A packages/schemas change reaches FIVE workspaces — run them all
grep -rn "@repo/schemas" apps packages --include="*.ts" --include="*.tsx" -l

npm run build:schemas
npm run check-types                    # turbo runs it across every workspace
npm run test --workspace=web
npm run test --workspace=api
```

`packages/schemas` is consumed by api, web, mcp, extractor and training. Tightening a field there is not a local change. Note that `apps/mcp` has **zero tests** — a schema change that breaks it will not be caught by a test suite, so read its call sites by hand.

### Shared-Code Impact Check

The full procedure behind SKILL.md §4.3.1. Runs whenever the feature changed anything in `apps/web/src/shared-components/`,
`apps/web/src/lib/`, `packages/schemas/src/`, or `apps/api/src/infra/di/container.ts`
— do this before closing:

1. Map the consumers (grep the import, per the commands above)
2. Group them by **usage shape** (distinct combination of props/variants)
3. Assess the blast radius of each change: new required prop, changed default,
   DOM/class changes, hook return shape, event signature, removed prop/export,
   a schema field made stricter
4. Fix the broken consumers **in this same PR** — or preserve compatibility
   with an opt-in prop whose default keeps current behaviour
5. Screenshot one screen per usage shape, before × after: a shape that should
   not have changed and did is a regression — fix it now
6. Hand the dev **one screen per usage shape** (route + how to get there +
   props exercised + what to look at) — never the full list of screens
   sharing the same props

---

## Rollback Strategy

If the implementation reaches a dead end:

### Per task:

```bash
git revert HEAD              # undo the last committed task
git reset --soft HEAD~1      # or soft-reset to redo it
```

### Full rollback:

```bash
git checkout main
git branch -D feat/feature-name
```

### Partial (keep the foundation, redo the UI):

```bash
git log --oneline            # find the foundation commit
git reset --soft <foundation-sha>
```

Whatever you roll back, record why in `IMPLEMENTATION-STATUS.md` and re-stamp the affected decision as **SUPERSEDED** in `decisions.md`. A rollback whose reason is not written down gets re-attempted by the next session.

---

## "Done" Criteria by Task Type

| Type                | Done criterion                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Schema/contract** | `build:schemas` + `check-types` pass; the contract test parses the REAL captured payload                                               |
| **Query hook**      | Returns typed data off `z.infer`; the response is parsed; loading and error paths work                                                 |
| **Page component**  | Renders all four states; the route is registered in `router.tsx` and reachable; visual scenario green                                  |
| **Subcomponent**    | Renders from the parsed real fixture; every variant row covered                                                                        |
| **Form**            | Submit works; validation shows inline errors; **every required field in the field table has a mounted input in every applicable mode** |
| **API use case**    | Unit-tested in isolation (core is framework-free); registered in `container.ts`; the route answers real JSON                           |
| **Tests**           | `npx vitest related --run` green; `test:coverage` no package below its floor                                                           |
| **Integration**     | The end-to-end flow works, and the write landed (postgres-mcp correlation-id check)                                                    |

---

## Escalation — When to Stop and Ask

| Situation                                                                          | Action                                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| G0 fails on an endpoint the spec says is live                                      | **Stop.** Report which demand failed on which registration; propose INFERRED + mock, or a route correction |
| Ambiguous design (two readings possible)                                           | Ask the dev, with both options                                                                             |
| A primitive in `shared-components/` cannot do what the design asks                 | Report the limitation, propose an alternative                                                              |
| The API returns a shape different from the spec                                    | Report the discrepancy, propose the delta table, do not silently adapt the schema                          |
| An existing test fails because of your change                                      | Explain what it tests and propose the adjustment                                                           |
| >3 fix cycles without resolution                                                   | Stop, explain the root cause, propose a different approach                                                 |
| A task needs a file outside the feature's scope                                    | List the files and ask for approval                                                                        |
| The spec contradicts itself                                                        | Point at the contradiction and ask which reading wins                                                      |
| A fix would require touching the known debt (the eslint backlog, `apps/mcp` tests) | Stop and ask — it is deliberately out of scope                                                             |

---

## Quality Metrics (self-assessment)

At the end of the implementation, self-assess:

```markdown
## Quality Report

| Metric                                     | Target           | Actual        | Status |
| ------------------------------------------ | ---------------- | ------------- | ------ |
| check-types errors                         | 0                | [N]           |        |
| Test failures                              | 0                | [N]           |        |
| NEW lint findings                          | 0                | [N]           |        |
| Coverage vs ratchet floor                  | at or above      | [per package] |        |
| G0 endpoints probed                        | all claimed-live | [N/M]         |        |
| Contract sensors on REAL payloads          | 1 per endpoint   | [N]           |        |
| Modes/tabs with a schema ⟷ UI sensor       | all applicable   | [N/M]         |        |
| Required fields with a mounted input       | 100%             | [N]%          |        |
| Variant matrix rows covered                | 100%             | [N]%          |        |
| `any` usage                                | 0                | [N]           |        |
| Acceptance criteria met                    | 100%             | [N]%          |        |
| Visual: screens × states with no open diff | 100%             | [N]%          |        |
```

This report goes into the final message to the dev (SKILL.md Phase 5.2).
