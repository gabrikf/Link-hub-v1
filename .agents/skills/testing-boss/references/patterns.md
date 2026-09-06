# Patterns — Twelve Cross-Framework Principles for Writing Tests That Survive Refactor

## Contents

- [How to use this catalog](#how-to-use-this-catalog)
- [Pattern 1 — Query by behavior, never by internals](#pattern-1--query-by-behavior-never-by-internals)
- [Pattern 2 — Selector hierarchy: role → label → text → test-id → structural](#pattern-2--selector-hierarchy-role--label--text--test-id--structural)
- [Pattern 3 — Wait on observable conditions, never on the clock](#pattern-3--wait-on-observable-conditions-never-on-the-clock)
- [Pattern 4 — Each test is independent and order-free](#pattern-4--each-test-is-independent-and-order-free)
- [Pattern 5 — Set up state before tests, do not clean up after](#pattern-5--set-up-state-before-tests-do-not-clean-up-after)
- [Pattern 6 — Test observable behavior, not implementation](#pattern-6--test-observable-behavior-not-implementation)
- [Pattern 7 — One behavior per test (not one assertion)](#pattern-7--one-behavior-per-test-not-one-assertion)
- [Pattern 8 — Test names read as specifications](#pattern-8--test-names-read-as-specifications)
- [Pattern 9 — Table-driven / parameterized for input variation](#pattern-9--table-driven--parameterized-for-input-variation)
- [Pattern 10 — Build test data via factories and builders](#pattern-10--build-test-data-via-factories-and-builders)
- [Pattern 11 — Mock at boundaries you do not control](#pattern-11--mock-at-boundaries-you-do-not-control)
- [Pattern 12 — Page Object Model is a tool, not a religion](#pattern-12--page-object-model-is-a-tool-not-a-religion)
- [Test structure shapes](#test-structure-shapes)
- [Test data tradeoffs](#test-data-tradeoffs)
- [Common framework gotchas](#common-framework-gotchas)
- [CraftHub binding — these twelve patterns in this repo](#crafthub-binding--these-twelve-patterns-in-this-repo)

## How to use this catalog

Each pattern names a principle and shows agnostic pseudo-code, and flags when to break it. Frameworks are illustration, not the subject — the principle is what transfers, and the [CraftHub binding](#crafthub-binding--these-twelve-patterns-in-this-repo) table below is what each one resolves to in this repo.

## Pattern 1 — Query by behavior, never by internals

**Principle.** Selectors that describe what a user perceives survive refactors of internals. Selectors tied to CSS classes, DOM indices, or generated IDs break on cosmetic change and couple tests to private structure.

**Pseudo-code.**

```
// good
click(query.byRole("button", { name: "Submit" }))
// bad
click(query.bySelector(".btn.btn-large.primary"))
```

**When to break it.** Structural elements with no accessible text (notification badges, counters, list items). Add a stable test-id and treat it as an explicit contract.

## Pattern 2 — Selector hierarchy: role → label → text → test-id → structural

**Principle.** Resilience and accessibility correlate. If the test can find an element via role and accessible name, real users and assistive tech can too. Each step down the ladder loses semantic grounding.

**Ladder (most → least preferred).**

1. ARIA role + accessible name
2. Label text (for form fields)
3. Visible text content
4. Alt text / title (image-only or fallback)
5. Explicit `data-testid` / `data-cy`
6. Structural selector (id / class / xpath) — escape hatch only

**When to break it.** Only when the rung above is ambiguous, dynamic, or genuinely non-semantic. Step down one rung at a time; document why.

## Pattern 3 — Wait on observable conditions, never on the clock

**Principle.** Hard-coded sleeps overshoot on fast machines and underrun in CI. Condition-based waits self-tune and surface the real failure (`element never became visible`) instead of "test timed out".

**Pseudo-code.**

```
// good
await expect(query.byText("Welcome")).toBeVisible()
// bad
await sleep(2000)
assert(query.byText("Welcome").exists)
```

**When to break it.** Never for normal element waits. A short sleep can be defensible for throttling a polling load test — flag it explicitly.

## Pattern 4 — Each test is independent and order-free

**Principle.** Coupled tests cascade. One early failure masks downstream bugs; reordering or running one test in isolation breaks.

**Operational rule.** A test that does not pass alone is a placement bug, not a feature.

## Pattern 5 — Set up state before tests, do not clean up after

**Principle.** "After" hooks aren't guaranteed to run (refresh, crash, abort). Before-hooks always do. State always starts known-good.

**Pseudo-code.**

```
// good
beforeEach(() => db.reset(); seed(); login());
// bad — runs only when the test exits cleanly
afterEach(() => db.reset());
```

**When to break it.** External resource leaks (sockets, temp files) must still be released via teardown. But *state for the next test* belongs in setup.

## Pattern 6 — Test observable behavior, not implementation

**Principle.** Refactoring should never break a passing test. If renaming a private function breaks tests, the test is reading internals.

**When to break it.** Pure-function unit tests legitimately assert on outputs. The rule applies at the component / integration layer.

## Pattern 7 — One behavior per test (not one assertion)

**Principle.** "One assertion per test" is a unit-test myth that misapplies to integration and E2E. The real rule: each test exercises one behavior; multiple assertions describing that behavior are encouraged.

**Pseudo-code.**

```
test("submits the form and shows confirmation", () => {
  fill(byLabel("Email"), "a@b.c")
  click(byRole("button", { name: "Submit" }))
  expect(byRole("status")).toHaveText("Submitted")
  expect(byRole("button", { name: "Submit" })).toBeDisabled()
})
```

**When to break it.** When two assertions describe two different behaviors, they really are two tests — split them.

## Pattern 8 — Test names read as specifications

**Principle.** A descriptive name is the bug report when the test fails. Vague names ("test1", "edge case") yield useless CI output.

**Template.** `"should <outcome> when <condition> given <state>"`

## Pattern 9 — Table-driven / parameterized for input variation

**Principle.** Many tests differ only in inputs and expected outputs. Repeating the body invites drift; one canonical body iterated over data keeps logic in sync.

**Pseudo-code.**

```
cases = [
  { name: "positive",  in: (2, 3),   want: 5 },
  { name: "negatives", in: (-2, -3), want: -5 },
  { name: "zero",      in: (0, 0),   want: 0 },
]
for case in cases:
  test(case.name, () => expect(add(...case.in)).toEqual(case.want))
```

**When to break it.** When each case's setup or assertion logic genuinely differs, the table hides the difference. Then write separate named tests.

## Pattern 10 — Build test data via factories and builders

**Principle.** Real domain objects often have ~20 fields; tests care about 1–2. Literal duplication breeds breakage on schema changes and obscures which field actually matters.

**Pseudo-code (builder).**

```
user = aUser()
  .withEmail("a@b.c")
  .withRole("admin")
  .build()
```

**When to break it.** Trivially shaped data (a single int, a 2-field struct). A literal is clearer than indirection. Builders pay off at roughly five+ fields or when defaults need selective override.

## Pattern 11 — Mock at boundaries you do not control

**Principle.** Mocking your own services freezes implementation. Mocking third parties stops their outages from flaking the suite.

**When to break it.** Never mock pure logic the team owns — call it directly.

## Pattern 12 — Page Object Model is a tool, not a religion

Body cut; number reserved so the binding table's index stays stable. This repo's only POM-shaped surface is `scripts/visual/scenarios/*.scenario.mjs` — the [CraftHub binding](#crafthub-binding--these-twelve-patterns-in-this-repo) table below already resolves the question and there is no independent payoff to write up here.

## Test structure shapes

### Arrange–Act–Assert (AAA) / Given–When–Then (GWT)

Three-phase canonical shape. Cypress: *"You might also see this phrased as Given/When/Then, or Arrange/Act/Assert. The idea is the same."* (https://docs.cypress.io/app/end-to-end-testing/writing-your-first-end-to-end-test)

```
test("...", () => {
  // Arrange
  const user = aUser().build()
  render(<Profile user={user} />)
  // Act
  click(byRole("button", { name: "Edit" }))
  // Assert
  expect(byRole("textbox", { name: "Name" })).toBeFocused()
})
```

### Table-driven / parameterized

For input variation only. Each row is a named record; iterate as subtests so individual failures are addressable.

### BDD nesting

`describe(component) > describe(feature) > test(scenario)`. Pact's recommended template (https://docs.pact.io/consumer).

### Long E2E scenario

For real end-to-end flows (checkout, signup), one test with many assertions across steps is acceptable — splitting penalizes setup cost and proves nothing extra (https://docs.cypress.io/app/core-concepts/best-practices).

## Test data tradeoffs

| Pattern               | When to use                                       | Risk                                        |
| --------------------- | ------------------------------------------------- | ------------------------------------------- |
| Literal struct        | Simple, 1–2 fields, single use                    | Drift if schema changes                     |
| Named fixture (JSON)  | Larger payloads, shared across many tests         | Hides which fields matter; opaque diffs     |
| Factory function      | Default-valid object with overrides per test      | Indirection requires reading factory        |
| Builder               | Many optional fields, fluent override needed      | Boilerplate to maintain                     |
| Object Mother         | Named canonical scenarios (`anAdminUser`)         | Combinatorial blowup if not curated         |

Default to factory or builder for any domain entity; reserve literals for the field the test is actually about.

## Common framework gotchas

1. **Awaiting an assertion vs awaiting inside it.** Playwright: `await expect(loc).toBeVisible()` retries; `expect(await loc.isVisible()).toBe(true)` does not. (https://playwright.dev/docs/best-practices)
2. **`getBy` vs `findBy` vs `queryBy` (Testing Library).** `getBy` throws when missing, `queryBy` returns null (use for "assert not present"), `findBy` is async with built-in retry (use for "appears later"). (https://testing-library.com/docs/queries/about)
3. **Snapshots are not for individual classes / attributes.** Use specific matchers (`toHaveClass`) instead; snapshots are for structural shape. (https://github.com/patternfly/patternfly-react/wiki/React-Testing-Library-Basics,-Best-Practices,-and-Guidelines)

## CraftHub binding — these twelve patterns in this repo

The catalog above is cross-framework. Here is which tool each pattern resolves to in CraftHub
(**vitest** everywhere; `@testing-library/react` + jsdom in `apps/web`; node-env and mostly
hermetic in `apps/api`; Playwright only inside the visual scenario runner under `scripts/visual/`).

| Pattern | Concretely, here |
|---|---|
| 1 — query by behavior | RTL `getByRole` / `getByLabelText` / `getByText`. `container.querySelector` and Tailwind class-name matching are internals — and class matching is especially brittle here, since Tailwind v4 utilities move with `DESIGN.md` token changes |
| 2 — selector hierarchy | role → label → text → `getByTestId` → structural. A control reachable *only* by test id is an accessibility finding, not just a test smell — Radix primitives give you the role for free, so needing a test id usually means the primitive was bypassed |
| 3 — wait on conditions | `findBy*` and `waitFor` in RTL; web-first assertions in the Playwright scenarios. A bare `setTimeout` sleep is forbidden in a vitest test, and `waitForTimeout` is forbidden in a scenario. If you are tempted, the mutation already told you when it settled — see W-35 in the `no-workarounds` catalog |
| 4 — independent, order-free | Each file gets a fresh `QueryClient` and a fresh Zustand store; never leak a `queryClient` across files, or React Query's cache turns test order into a dependency. On the api side, build a fresh app per file through `build-test-app.ts` — the in-memory repositories are per-instance for exactly this reason |
| 5 — set up before, don't clean up after | Seed state in `beforeEach`, not by undoing in `afterEach`. `vi.restoreAllMocks()` in setup beats hand-written teardown |
| 6 — behavior, not implementation | Assert what renders and what the handler receives — not that a `useEffect` ran, not that a Zustand selector was called, not that a tsyringe token was resolved |
| 7 — one behavior per test | One assertion subject per `it`. A `describe.each` block is still one behavior per case; the table is the axis of variation, not an excuse to assert five things |
| 8 — names read as specifications | English, symptom-first. For a bug, carry the GitHub issue number inside the case name — `it('#214: keeps the unedited layout blocks after a failed save', …)` — never in a file-header comment, which detaches the moment somebody adds a second case |
| 9 — table-driven | `describe.each` / `it.each` from vitest. The natural axes here are: disclosure-policy level, post visibility, the four UI states, and the seed blueprint a candidate came from |
| 10 — factories and builders | Factories are for *client* state (form values, filters, UI props) and for domain entities in `apps/api/src/core/entity/**` (see the existing `*-test-factory.ts` files). API payloads are **not** invented — see the fixture rule below |
| 11 — mock at boundaries you don't control | Mock the HTTP boundary and the genuinely external providers — OpenAI, the storage provider, the clock. Do **not** mock `@repo/schemas`, the use case under test, or the in-memory repository: mocking the parser or the repository deletes the exact guarantee the test exists to prove |
| 12 — POM is a tool | Applies to `scripts/visual/scenarios/*.scenario.mjs` only. Unit tests use RTL queries directly; a page object over an RTL render is indirection with no payoff |

**Test-data tradeoff table, resolved for CraftHub:** for anything crossing the HTTP boundary the
answer is **a real captured payload, parsed through `@repo/schemas`**. Capture it from
`http://localhost:3333` against seeded data (`bash db-manage.sh seed-all`), commit it as a
fixture, and assert it with `.parse()`. A hand-written payload that agrees with your mental model
of the API proves only that your mental model is self-consistent. Literals and factories are for
the client-side object or the domain entity the test is actually about.
