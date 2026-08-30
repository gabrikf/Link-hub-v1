# Review Taxonomy

The grammar for defects, advisories, evidence, and objective suppressions. Every review uses one assertive posture: report every specific, actionable survivor regardless of size.

## Result classes

| Class | Categories | Verdict impact | Decision rule |
| --- | --- | --- | --- |
| **Defect** | `⚠️ Potential issue` | Critical/Major block SHIP | The change can produce a wrong result, crash, leak, vulnerability, broken contract, or failing-capable test gap under a concrete input/state. |
| **Advisory** | `🛠️ Refactor suggestion`, `🧹 Nitpick` | Never | The code can remain functional, but a bounded change measurably improves maintainability, simplicity, clarity, naming, documentation, idiom, or conformance with a project rule/skill. |

There is no advisory quota. A small advisory is valid when the premise is observed, the benefit is specific, and the fix is bounded. Formatter-owned style and vague preferences are suppressions, not advisories.

## Severity

| Badge | Class | Bar |
| --- | --- | --- |
| `🔴 Critical` | defect | Plausible production incident, data loss, or security compromise. |
| `🟠 Major` | defect | Wrong behavior, user-visible degradation, unsafe rollout, or a bug awaiting a realistic trigger. |
| `🟡 Minor` | defect or advisory | Narrow real defect, safety erosion, or a meaningful non-local maintainability improvement. |
| `🔵 Trivial` | advisory | Cheap clarity, naming, documentation, small deduplication, or idiom improvement. |

Severity measures impact if unfixed, not confidence or effort. Choose the lower level when between two levels.

## Effort modifier

`⚡ Quick win` means the fix is local and mechanical (roughly ≤15 lines at one site). A larger advisory remains reportable; effort never suppresses it.

## Source attribution

Every result names what produced it through evidence and optional rule ids: repository rule/skill, learning, linter interpretation, verification command, or direct code review. Quote bound rules verbatim through their registry ids and source paths.

## Evidence certificates

Defects start with a causal certificate:

```text
Premise: <observed fact at file:line> → Path: <named caller/input/control flow> → Verdict: <resulting failure>
```

Advisories start with an improvement certificate:

```text
Premise: <observed fact at file:line> → Improvement: <specific measurable benefit> → Fix: <bounded change>
```

Later evidence entries record one `command or file:line → what it showed` check each. Advisories do not invent a runtime failure to clear the defect evidence bar.

## Outside-diff results

A result on untouched lines is allowed only when the diff breaks that code or when a sibling path must mirror the changed invariant. Mark it `in_diff: false` and `hunk: null`; it belongs in the summary rather than an inline comment.

## Objective suppressions

When an investigated candidate is rejected, record it in `suppressions` with one of these reasons and a concrete note:

1. `linter-overlap` — a linter/typechecker lane already reports it.
2. `intentional` — an adjacent justified disable, ADR, comment, or behavior-locking test proves intent.
3. `generated-vendored` — the manifest excludes ownership of generated/vendor code.
4. `formatting` — a configured formatter owns the proposed change.
5. `speculative` — a defect claim has no concrete failure path and no valid advisory premise.
6. `pre-existing` — untouched debt satisfies neither outside-diff clause.
7. `phantom-knowledge` — the claim depends on uninspected code or an irrelevant framework generality.
8. `duplicate-within-job` — the candidate is represented by another result and its anchor appears under `also_applies`.

Profile, volume, low severity, and personal taste are not suppression reasons.

## Volume discipline

There is no numeric cap. Find broadly, refute actively, report every survivor, and account for every investigated rejection. One root cause becomes one result; search every occurrence and list the rest under `also_applies`.

## CraftHub review priorities

The grammar above is universal. These six are what actually goes wrong in **this** repo — check every one against every diff that touches its scope, and calibrate severity as stated. They are priorities, not a checklist: a diff that clears all six can still carry defects.

### 1. Contract drift against `@repo/schemas` — 🔴 / 🟠

`packages/schemas` is the one contract shared by `apps/api`, `apps/web`, `apps/mcp`, `apps/extractor` and `apps/training`. Drift is this repo's highest-yield defect class because it type-checks on the side that changed and fails silently on the four that did not.

Look for: a controller serializing a field the schema does not declare, or omitting one it does; a schema loosened (`.optional()`, `z.string()` for a former enum, `z.record(z.string(), z.unknown())` for a former shape) so a failing payload passes; a cast (`as`, `as unknown as`) standing where a `.parse()` used to be; a response shape changed without `npm run build:schemas` plus a consumer sweep across all five workspaces.

**Severity:** 🔴 when a consumer reads the drifted field at runtime and the failure is silent (`undefined` rendered, empty search results, a swallowed MCP tool response). 🟠 when the drift is real but caught by a parse boundary that throws visibly. A widened schema is never a nitpick — record it as a defect and name every consumer it exposes.

Note schemas import from `zod/v4`. A v3 idiom in a v4 module is a separate finding.

### 2. Disclosure-policy leaks — 🔴

The per-user **disclosure policy** limits what a coding agent may reveal about the user's employers. Every path where agent-authored content reaches a public surface has to pass through it: the MCP publish path in `apps/mcp`, the local git extractor in `apps/extractor`, the posts pipeline in `apps/api`, and the public profile route `/$username` — which needs **no session at all**.

Look for: a post, activity item, commit summary, repo name, branch name, file path or diff excerpt reaching a response without a policy check; a policy evaluated on the write path but not the read path (or the reverse); a policy defaulting to permissive when the user has no explicit setting; unhashed repository content leaving `apps/extractor`; a new field added to a public profile payload that nobody checked against the policy; an error message or log line echoing the redacted value.

**Severity:** 🔴 by default — this is the product's core privacy promise, and the leak surface is a public unauthenticated route. Downgrade to 🟠 only when the exposure is provably behind authentication *and* limited to the owner's own data. "Probably fine" is not a downgrade; if the path is unclear, report it and say what you could not establish.

### 3. Missing dark-mode variants — 🟡 (🟠 when unreadable)

Tailwind v4, CSS-first, no `tailwind.config.js`. `DESIGN.md` at the repo root defines the token pairing; a color applied in one theme only is a defect against it.

Look for: a `bg-*` / `text-*` / `border-*` utility with no `dark:` counterpart where the surrounding component has one; a raw hex or `rgb()` literal instead of a token; a token used outside its semantic role; an SVG, chart, badge or shadow whose contrast collapses in the other theme; `@custom-variant` usage that does not match the file's existing convention.

**Severity:** 🟡 normally. 🟠 when the result is unreadable or invisible in one theme — that is user-visible breakage, not polish. Do not report a *complete* pair as a nitpick because you would have picked different tokens; that is taste, and taste is a `speculative` suppression.

### 4. N+1 queries through Drizzle — 🟠

Drizzle 0.44 over Postgres/pgvector. The N+1 here is usually a `for`/`map` over a result set with an `await db…` inside, or a repository method called per item by a use case that already had the ids.

Look for: an `await` on a query inside a loop or inside `Promise.all(items.map(...))` where one `inArray` would do; a relational read expressed as a per-row lookup; a use case in `apps/api/src/core/**` calling a repository method once per element; a public profile or search response assembling children row-by-row; a missing index on a column the new query filters or orders by — and, for vector columns, a distance query with no HNSW/IVFFlat index behind it.

**Severity:** 🟠 when the loop is unbounded by user-controlled input (a search result set, a profile's blocks, a recruiter's candidate list). 🟡 when bounded by a small constant. Verify against `apps/api/src/infra/database/` rather than asserting from the call shape alone — Drizzle's relational query builder does batch some of these, and claiming an N+1 that the query planner does not produce is `phantom-knowledge`.

### 5. Unbounded OpenAI spend — 🟠

Resume parsing, recruiter-query conversion and embedding all call OpenAI. Cost is a correctness property here, not an ops concern.

Look for: a call inside a loop over user-supplied items with no batching and no ceiling; a retry with no attempt cap or no backoff; a missing timeout; a whole uploaded document sent when a bounded excerpt would do; no cap on input length before embedding; a BullMQ job that can re-enqueue itself on failure; a cache or dedupe removed from an embedding path; an endpoint that lets an unauthenticated or unthrottled caller trigger a model call.

**Severity:** 🟠 when user input can multiply the call count without a bound. 🔴 when an unauthenticated route can trigger it, which turns cost into a denial-of-wallet vector. 🟡 for a bounded inefficiency. Name the multiplier explicitly in the Path clause — "one call per work-history entry, and entries are user-supplied and uncapped" is evidence; "this might be expensive" is not.

### 6. Missing four-state UI handling — 🟠

Every screen that fetches has four reachable states: **loading, empty, error, filled**. A screen that renders only the filled state ships a white screen the first time the query is pending or rejects, and **a white screen is maximum-severity breakage from the user's side**.

Look for: a TanStack Query consumer reading `data` without handling `isPending` and `isError`; an empty array rendering nothing rather than an empty state; an error branch that logs but returns `null`; a mutation with no pending affordance on the control that triggered it; a `data!` or `data?.items ?? []` that quietly turns "failed" into "empty" — the two need different copy; a new route in `router.tsx` with no error boundary above it.

**Severity:** 🟠 when a real user path reaches the unhandled state (a slow network reaches `loading`; a new account reaches `empty`; a 500 reaches `error` — all three are real). 🟡 when the state is genuinely unreachable and the gap is defensive only. Confirm reachability before choosing: the visual scenario runner (`node scripts/visual/run.mjs …`) walks all four and is the cheapest way to settle it.
