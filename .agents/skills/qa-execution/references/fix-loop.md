# Fix Loop

What happens between finding and closing. The loop is governed: the runner judges the **size of the fix before touching code**, fixes only what is safely inside bounds, and escalates the rest with options — because an agent that patches the product mid-QA to clear its own findings is optimizing the dashboard, not the product.

Fidelity boundary first (per the persona-fidelity guardrails, routed at Step 3 of the SKILL): fixes never happen _inside_ a session. A session ends, findings exist, then the governor runs.

## Contents

- The governor
- Auto-fix requirements
- Where the test goes, and what it is made of
- Decisions for a Human
- Paper cuts in the loop
- Retest protocol
- The exit gate
- Anti-patterns

## The governor

For each `fail` finding or sharp paper cut, judge before editing. **Auto-fix only when ALL hold:**

- **Small** — a few files, no schema/data migration, no `@repo/schemas` contract change, no DI container rewiring.
- **Well-understood** — root cause identified and stated (symptom ≠ cause, written separately in the bug).
- **Low-risk** — blast radius contained to the touched surface; adjacent journeys unlikely to shift.
- **No product trade-off** — the correct behavior is unambiguous. Anything a product owner or designer might reasonably decide differently is not yours to decide.

Anything failing one test → **Decisions for a Human**. When a fix grows beyond bounds mid-edit: revert fully, restore the finding to `Fail`, escalate. A half-applied fix is worse than an open bug.

**Three additional hard stops, specific to this product:**

- **Any change to what the disclosure policy permits is a human decision, always.** Fixing _enforcement_ (a filter that missed a casing variant, a redaction applied at paint instead of at storage) is inside bounds. Changing the _levels_, the defaults, or what a level means is a product decision even when the current behavior is obviously wrong.
- **Never touch the deliberate debt.** The 30 pre-existing eslint errors in `apps/web`, the missing eslint history in `apps/api`, the zero tests in `apps/mcp`, `eslint-plugin-only-warn` in `packages/eslint-config`, the stray `pluguins/` directory. Not on the way past, not "while I'm here".
- **`packages/schemas` is the contract package.** A change there ripples to api, web, mcp, extractor and training, and everything must be rebuilt (`npm run build:schemas`) before it type-checks. That is by definition not small.

## Auto-fix requirements

Every auto-fix ships with, non-negotiably:

1. **A regression test that failed before and passes after — written FIRST.** Not "add a test once it works": write the test, run it, and **see it fail for the right reason** (the assertion about the broken behavior — a failure from a typo, a bad import or a missing mock proves nothing). Only then the fix. This is what makes the bug curve go down instead of sideways. When no automated test is meaningful (pure copy, purely visual), a documented replay stands in: the exact re-walk steps, the before/after evidence in both themes, and the stated reason no test applies — plus an `automation-backlog/` entry recording the debt.
2. **One logical fix per commit**, message citing the bug id, Conventional Commits, in English.
3. **Root cause in the bug file** (`Fix` section: root cause, commit SHA, regression test path) **plus the Root Cause value** from the fixed taxonomy in `../qa-report/references/bug-registry.md`.
4. **Retest** per the protocol below before the finding's row moves to `Fixed`.

Tests in this repo are **vitest** everywhere (`describe/it/expect` imported from `vitest`). There is no jest — never write `jest.mock`, `jest.fn`, or a `jest.config`. Focus a run with `npx vitest related <file> --run`.

## Where the test goes, and what it is made of

| Subject                     | Where the test goes                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A web component or hook     | Beside it in the feature: `apps/web/src/features/<feature>/...`, vitest + `@testing-library/react` + jsdom                          |
| A shared web primitive      | Beside it in `apps/web/src/shared-components/`                                                                                      |
| A pure API use case         | `apps/api/src/core/use-case/<name>-use-case/<name>.use-case.test.ts`                                                                |
| An API route / controller   | Through `apps/api/src/infra/http/test-support/build-test-app.ts` — in-memory repositories + `server.inject`, no socket, no database |
| A shared contract           | `packages/schemas` — the strongest sensor in this repo                                                                              |
| A walked flow worth pinning | `scripts/visual/scenarios/<name>.scenario.mjs`                                                                                      |

**The contract test is the sensor that pays.** Every API response an agent claims to have shipped should be asserted by `.parse()`ing a **real captured payload** through its `@repo/schemas` zod schema. Drift then surfaces as a parse failure or a type error rather than a silent runtime bug at 2am. Capture the payload from the running dev API — never hand-write the fixture from memory of what the shape should be.

Two facts that will otherwise cost you an afternoon:

- **`npm run build:schemas` first, always.** Everything types against `@repo/schemas`' `dist/`; turbo's `dependsOn: ["^build"]` expects it built, and a fresh tree fails `check-types` without it.
- **Three API test files need the docker stack up** (`bash db-manage.sh start`) or they hang for 60-90 seconds rather than failing: `apps/api/src/infra/di/container-wiring.test.ts`, `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`, `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`. Two of those, plus `.../resume/test/search.e2e.test.ts`, also need a funded `OPENAI_API_KEY` and are excluded from CI by name.

The **`testing-boss`** skill owns how to write the test; **`no-workarounds`** owns what makes it a fix.

### And fix the cause, not the symptom

Load the **`no-workarounds`** skill before writing the fix. A cast, a lint suppression, a swallowed error, a `setTimeout` or a deeper `?.` chain that makes the finding stop showing is not a fix. Two that matter specially here:

- A `dark:` class added to the one element the screenshot caught, when the whole surface was authored without theme variants, fixes the screenshot and not the bug.
- A redaction added at the render layer, when the leak is that the unredacted body was stored and is served by the API, moves the leak rather than closing it.

## Decisions for a Human

Escalations are findings with a recommendation, recorded in the report's **Decisions for a Human** section:

```markdown
### <finding title> (bug id / paper cut)

- What's broken: <user-side description, evidence path>
- Why not auto-fixed: <which governor bound it fails>
- Options:
  1. <option> — <trade-off>
  2. <option> — <trade-off>
- Recommendation: <one of the options, with the reason>
```

The matrix row becomes `Blocked (human decision)` — a terminal state for this run. It is never silently retried, and the scenario's `qa_status` becomes `blocked-decision` so the tracker surfaces it across cycles.

## Paper cuts in the loop

Sharp paper cuts (the persona would complain or hesitate to return) enter the governor like failures — many are copy, spacing or missing-`dark:`-variant fixes squarely inside auto-fix bounds, and fixing them is where dogfooding pays for itself. Dull ones stay in the report for pattern-watching; a paper cut recurring across personas or cycles gets promoted to a `Friction` bug.

## Retest protocol

After any fix:

1. Re-walk the impacted journey **from scratch, in persona** — a fresh session (fresh state, real entry), not a resumed browser. The Recovering User persona is often the right walker: it tests the fix _and_ the recovery experience. After a disclosure leak it is the only honest walker.
2. Re-walk **in both themes** whenever the fix touched anything rendered.
3. Re-walk **adjacent journeys** — the ones sharing components or use cases with the change. A fix that breaks the neighbor is a regression the matrix must catch now, not next cycle.
4. On pass: bug → `fixed` (then `verified` once confirmed under the original persona), matrix row → `Fixed`, tracker row per the schema (`fix_status: fixed`, `retest_status: pass`, `fix_commits` updated).
5. On fail: reopen, revert if the fix caused it, escalate if the second attempt would exceed the governor.

## The exit gate

Before the run's Final Status:

```bash
npm run build:schemas                       # always first
node scripts/guardrails/pre-push.mjs        # the gate — the same script husky pre-push runs
```

A green matrix with a red gate is not ready — some fix broke something the sessions didn't walk. The gate output goes in the report verbatim; a red gate makes Final Status "not ready" regardless of the matrix.

Individual sensors, when one needs isolating:

```bash
npm run check-types                          # turbo run check-types — the real CI gate
node scripts/guardrails/lint-changed.mjs     # eslint on changed files, ratcheted against the backlog
npm run test --workspace=web                 # vitest run
npm run test --workspace=api                 # vitest run — 3 files need docker
npm run test --workspace=@repo/schemas
npx vitest related <file> --run              # only the suites touching one file
npm run test:coverage                        # ratchet floors, target 70
node scripts/visual/run.mjs scripts/visual/scenarios/<name>.scenario.mjs
```

`lint-changed` fails on **new** findings, not on the 30-error backlog — a red lint result after a fix means the fix introduced it. Coverage floors sit at the measured baseline and may only go up; coverage is a flashlight, not a correctness gate, so pair it with the contract test rather than chasing the number.

(The gate was green at Step 1 — this run catches what _this run's fixes_ changed.)

## Anti-patterns

- **Fix-forward inside the session** — patching mid-walk destroys role fidelity and hides how a real user experiences the bug.
- **Fix without regression proof** — "fixed it, looks good" is a claim. Red-before/green-after or a documented replay, always.
- **Test written after the fix** — a test authored against code you already changed is written to pass, not to catch. It never proves the bug existed, and it would not have caught it. Red first or it does not count.
- **Writing a jest test** — there is no jest here. Vitest, always.
- **Hand-written contract fixtures** — a fixture invented from memory of the shape asserts your memory, not the API. Capture a real payload.
- **Silencing the signal** — `as any`, `eslint-disable`, an empty `catch`, a `setTimeout` that "fixes" the race. Load `no-workarounds`.
- **Scope-creep fixes** — "while I'm here" refactors ride along and widen blast radius. One logical fix per commit. This includes the known debt: leave it alone.
- **Deciding product questions** — picking a behavior a designer might pick differently, to clear a row. Escalate with options. Disclosure _semantics_ are always in this bucket.
- **Retesting only the fixed journey, in only one theme** — the neighbors and the other theme are where governed fixes still bite.
- **Silently requeueing blocked items** — `Blocked (human decision)` and `Blocked (needs human verify)` are terminal for the run; they wait for a person, visibly.
