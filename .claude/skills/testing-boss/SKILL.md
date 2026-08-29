---
name: testing-boss
description: >-
  Testing doctrine for tests that reveal bugs instead of passing for the wrong
  reason — spanning software and LLM/AI systems. Use when authoring or reviewing
  vitest tests in apps/api, apps/web or packages/schemas, adding a mock, deciding
  where a test belongs (core use case vs build-test-app.ts vs @repo/schemas
  contract assertion vs @testing-library/react vs the visual scenario runner),
  letting a coding agent generate tests, triaging flaky or infrastructure-bound
  suites, or designing an eval for the OpenAI resume-parsing, recruiter-query and
  embedding features. Not for general code review, library debugging unrelated to
  tests, CI pipeline design beyond tests, or production observability.
metadata:
  author: Pedro Nauck
  github: https://github.com/pedronauck
  repository: https://github.com/pedronauck/skills
---

# Testing Boss

Tests exist to expose defects, not to keep CI green. A test that fails has done its job; a test that passes for the wrong reason is worse than none. The doctrine spans human and AI-generated code, LLM/agent features, and the CI that gates them; its body lives in `references/` as language-agnostic pseudo-code.

## Iron Laws

Apply every law that bears on the change under test. They subsume every anti-pattern named in the references; when two disagree, the lower-numbered one wins.

```
1. Test the behavior, never the mock.
2. Push every test to the lowest layer that can detect the failure.
3. When a test fails, fix production first — change the test only after writing why.
4. Real systems gate the merge. Mocks isolate; they do not validate.
5. Coverage is a flashlight. Mutation score is a quality probe. Neither is a target.
6. No test-only methods, branches, or flags leak into production code.
```

## Reference router

The Iron Laws are the always-loaded tripwire; each reference is the contract. Match the task, read the listed file(s) **in full** before producing output, and apply every gate, pattern, and principle in them that bears on the work.

| When you are… | Read in full |
| --- | --- |
| Deciding where a test belongs — layer, owner, boundary, or whether to write it at all | `references/foundations.md` |
| Writing a test at any layer — selectors, waits, test data, isolation, what to mock | `references/patterns.md` |
| Reviewing a test, smelling brittleness, or rebuilding a brittle suite | `references/antipatterns.md` |
| Letting a coding agent generate, modify, or "fix" tests | `references/ai-writes-tests.md` + `references/antipatterns.md` |
| Triaging flaky CI, designing gates, or choosing contract / property / mutation tests | `references/ci-automation.md` |
| Designing an eval for an LLM/agent feature — oracle ladder, LLM-as-judge, RAG, trajectory vs outcome | `references/llm-eval.md` |

Each reference ends with its own sources; `references/sources.md` is the consolidated bibliography for auditing any claim.

---

# CraftHub binding — the doctrine, concrete in this repo

The Iron Laws and the references are framework-agnostic. This section is what they mean **here**.
It is not optional.

## Stack

| | Here |
|---|---|
| Runner | **vitest** — never jest. `describe` / `it` / `expect` are imported from `vitest`; doubles are `vi.fn`, `vi.mock`, `vi.spyOn`. 3.x everywhere except `apps/training`, which is on 4.x |
| Commands | `npm run test --workspace=web`, `npm run test --workspace=api`, `npm run test --workspace=@repo/schemas` (each is `vitest run`). Focused: `npx vitest related <file> --run`. Coverage ratchet: `npm run test:coverage` |
| Before any of them | `npm run build:schemas`. Everything types against `packages/schemas/dist/`, and turbo's `dependsOn: ["^build"]` exists for exactly this reason |
| DOM | `@testing-library/react` + jsdom in `apps/web` |
| API env | node, and **mostly hermetic** — see `build-test-app.ts` below |
| Language | Tests are written in **English**, like all code in this repo |
| Naming | kebab-case files, `*.test.ts(x)` |

## Where a test belongs

Push it to the lowest layer that can detect the failure (Iron Law 2). In this repo that ladder is
concrete:

| The thing you are testing | Where it goes | Why that layer |
|---|---|---|
| A **pure business rule** — scoring, disclosure-policy resolution, layout normalization, ranking | `apps/api/src/core/**`, in the use case's own folder next to `<name>.use-case.ts` | `core/` has no framework in it. A rule tested here needs no app, no server, no database, and fails in milliseconds pointing straight at the rule |
| **HTTP behaviour** — status codes, auth, validation rejection, response shape | `apps/api/src/infra/http/**`, built through `apps/api/src/infra/http/test-support/build-test-app.ts` | In-memory repositories plus `server.inject` — **no socket, no database**. You get the real Fastify pipeline (hooks, the zod type provider, `global-error-handler.ts`) with none of the infrastructure. This is the default for anything route-shaped |
| A **contract** — "does the API really return what `@repo/schemas` says" | Wherever the payload is consumed, asserted by `.parse()`ing a **REAL captured payload** through the shared schema | This is the strongest sensor in the repo. See below |
| **Component behaviour** — props, variants, the four states, what a handler receives | `apps/web/src/**`, co-located with the component, `@testing-library/react` | The component's own layer. A rendered assertion is cheaper and more precise than driving a browser |
| **Whole-screen state coverage** — every state of a page in one pass | The **visual scenario runner**: `node scripts/visual/run.mjs scripts/visual/scenarios/<name>.scenario.mjs` | One browser launch walks loading / empty / error / filled and fails on console errors, uncaught exceptions and unmocked 4xx/5xx. A unit test cannot see a white screen; this can. Use `node scripts/visual/session.mjs login` for an authed storageState |
| **Did the write actually land** | After the action, query the target table by a correlation id through **postgres-mcp** (restricted, local dev DB only, configured in `.mcp.json`) | An optimistic UI and a 200 both lie. The row does not |

Co-locate, never centralize. A test parked far from its subject is a test nobody updates when the
subject moves.

## Real payloads are mandatory — the contract sensor

**An invented API payload is a forbidden test double.** `packages/schemas` (`@repo/schemas`) is the
one contract shared by `apps/api`, `apps/web`, `apps/mcp`, `apps/extractor` and `apps/training`.
Every response an agent claims to have shipped should be asserted by `.parse()`ing a **real
captured payload** through the matching zod schema:

```ts
import { profileResponseSchema } from '@repo/schemas';
import capturedProfile from './fixtures/profile-seed-react-frontend-003.json';

it('the /profile/:username response still matches the shared contract', () => {
  expect(() => profileResponseSchema.parse(capturedProfile)).not.toThrow();
});
```

Capture it for real: `bash db-manage.sh start`, `bash db-manage.sh seed-all`, then hit
`http://localhost:3333` (Swagger at `/docs`, seed profile
`/profile/seed-react-frontend-003`) and commit what came back. Drift then surfaces as a parse
failure or a type error instead of a silent runtime `undefined` three layers away.

A hand-written payload proves only that your mental model is self-consistent — Iron Law 4 in local
dress: the mock isolates, it does not validate. And never "fix" a parse failure with a cast or by
widening the schema; see W-31 and W-32 in the `no-workarounds` catalog.

Note the schemas import from `zod/v4`. Check the v4 API through the `context7-usage` skill before
reshaping one.

## Tests that lie about being runnable

Some suites in `apps/api` need real infrastructure. They are not hermetic, they do not fail fast,
and **they hang for 60–90 seconds** when their dependency is missing rather than telling you why.
Know them before you run a workspace-wide `npm run test --workspace=api` and conclude the suite is
broken.

**Need docker Postgres/pgvector up** (`bash db-manage.sh start`):

- `apps/api/src/infra/di/container-wiring.test.ts`
- `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`
- `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`

**Need a funded `OPENAI_API_KEY`** — and are excluded from CI **by name**:

- `apps/api/src/infra/http/controllers/resume/test/search.e2e.test.ts`
- `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`
- `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`

Three rules follow:

1. **Start the infrastructure; do not skip the test.** `bash db-manage.sh start` costs seconds.
   A `.skip` or a `skipIf` on one of these deletes the only coverage of the thing most likely to
   break, while leaving a green checkmark that says otherwise (W-33).
2. **Do not push a hermetic test's logic into one of these files.** If a behaviour can be proven
   through `build-test-app.ts`, it belongs there — Iron Law 2. These files exist for what genuinely
   cannot be proven in memory: pgvector distance behaviour, real index selection, real DI wiring.
3. **A new test that silently needs infrastructure is a new lie.** If you add one, name it `.e2e.test.ts`,
   say what it needs at the top of the file, and add it to this list. An unlisted infrastructure-bound
   test is indistinguishable from a flake.

`apps/mcp` has **zero tests** — a known, recorded gap, not an invitation to write a mock-only suite
that proves nothing. If you test it, test it through its real stdio transport against a running API.

## What a component test must contain

A component in `apps/web` is not covered until all four hold:

1. **One test per prop and per variant** — asserting what it actually *renders*: the text or role,
   the branch the prop toggles, the visible change it causes. A prop with no test is an untested
   public API.
2. **The four states** — loading, empty, error, filled (plus disabled where it applies). A screen
   that fetches has all four reachable; assert all four. **A white screen is a maximum-severity
   bug**, and it is exactly what an unasserted error state ships.
3. **The interactions** — click, submit, keyboard — and **what the handler receives**, not merely
   that it was called.
4. **Accessibility basics** — reachable by role or label (`getByRole`, `getByLabelText`), not only
   by test id. Selector hierarchy per Pattern 2 of `references/patterns.md`. Radix primitives give
   you the role for free; needing a test id usually means the primitive was bypassed.

Assert rendered behaviour, not Tailwind class names. Utilities move when `DESIGN.md` tokens change;
what the user sees does not.

## Red first — non-negotiable for a bug

**No PR that fixes a bug is complete without a test that failed before the fix and passes after.**

```
1. Reproduce the bug in a test, co-located with its subject, with a real payload.
2. Run it. WATCH IT FAIL.
3. Read the failure. It must fail for the RIGHT reason — the assertion about the buggy
   behavior. A test failing on a typo, a bad import, a missing mock, an unbuilt
   @repo/schemas or a thrown ReferenceError is not a red test; it proves nothing and
   you have not reproduced anything.
4. Only now write the fix (root cause — load the `no-workarounds` skill).
5. Same test green; `npx vitest related <file> --run` still green.
```

If the test passes before you touch production code, you did not reproduce the bug — you guessed.
Go back to the investigation.

Name the test after the **symptom**, not the fix, and carry the GitHub issue number inside the case
name so the history survives a rename:

```ts
it('#214: keeps the unedited layout blocks when a save fails', () => { … });
```

Never put the issue reference in a file-header comment — it detaches from the case the moment
somebody adds a second one.

## LLM features need evals, not assertions

CraftHub runs resume parsing, recruiter-query conversion and embedding through OpenAI, plus an
in-browser TensorFlow.js re-rank. **None of those have a single correct output**, so a
`toEqual` against one golden string is a test that will fail on a model version bump for reasons
unrelated to quality — and pass while quality degrades.

Read `references/llm-eval.md` in full before testing any of them: the oracle ladder (prefer a
cheap deterministic check over an LLM judge), outcome vs trajectory, and how to size and version an
eval set. Concretely here:

- **Resume parsing** — the strongest oracle is structural, and it is free: does the parse result
  `.parse()` clean through the `@repo/schemas` resume schema? Assert that on a corpus of real
  resumes before reaching for anything softer.
- **Recruiter query → search** — evaluate by *retrieval outcome* over the seeded blueprints
  (`seed-react-frontend-003` and friends), not by the intermediate query text. Recall@k over known
  seed users is a real oracle.
- **Embeddings / AI Match %** — assert ordering properties and stability, not float equality.
- **Cost is part of the eval.** Unbounded OpenAI spend is a defect. Assert call counts and token
  ceilings the way you would assert an N+1.

Keep the eval suite out of the default test run — it costs money and it is not a gate — and pin
which model version a recorded score belongs to.

## Iron Law → the mechanism that carries it here

| Iron Law | Carried by |
|---|---|
| 1. Test the behavior, never the mock | **Judgment only.** Nothing blocks a test that asserts its own mock. This is what review and the `deep-review` skill are for |
| 2. Push every test to the lowest layer that can detect the failure | **Judgment**, with a strong pull from the placement ladder above. `build-test-app.ts` exists so that "I needed a real server" is almost never true |
| 3. When a test fails, fix production first | **Process.** Change a test only after writing down why the old expectation was wrong — and only after checking what else depended on it |
| 4. Real systems gate the merge; mocks isolate, they do not validate | **Partly mechanical**: `.parse()` against `@repo/schemas` over real captured payloads, plus the visual scenario runner, plus postgres-mcp verification of the actual row. The choice to mock is still judgment |
| 5. Coverage is a flashlight, not a target | **Mechanical floor**: `npm run test:coverage`, per-package floors sitting at the measured baseline and permitted to move only **up**, target 70. The floor is enforced; the *quality* above it is judgment — 70% covered by tests that assert nothing is 0% tested |
| 6. No test-only methods, branches or flags in production code | **Judgment**, plus `node scripts/guardrails/lint-changed.mjs` catching the `as any` / suppression such hooks usually need. A clean test-only branch still passes — that one is on you |

## The gate

```bash
node scripts/guardrails/pre-push.mjs   # the same script husky pre-push and the Stop hook run
```

Machine-checkable things live in that script. Everything left in this file is a design decision,
and design decisions are why the skill exists.
