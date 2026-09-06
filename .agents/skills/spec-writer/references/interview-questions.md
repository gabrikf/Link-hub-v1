# Interview Question Catalogue

Internal reference for `#spec-writer`. Pick **5-8 questions** relevant to the feature in hand. Never use them all — choose surgically, only where a real gap exists.

**Golden rule:** if the answer can be inferred from `AGENTS.md`, `DESIGN.md`, the design, or the existing code — **do not ask, decide.**

**The exceptions that are always asked (or, in `--all-default`, always assumed loudly and recorded in `decisions.md`):**

- The product spec and the design, if either is missing from `refs/`. These are **mandatory**.
- Which members of a variant enum are in scope, if the feature renders a discriminated set.

An API contract is **not** in that list: it may legitimately not exist yet, and the spec proceeds with an inferred contract plus a mock flow.

---

## 1. Data and API

Use when the feature involves server data and its origin is unclear.

| #   | Question                                                                                                         | When to use                                         |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1.1 | Does the endpoint for [resource] already exist, or does `apps/api` still need it?                                | Whenever the feature consumes server data           |
| 1.2 | Do you have the route? (path, method, params) — and is it registered at the bare path, under `/api/v1`, or both? | Always, even if the route is not live yet           |
| 1.3 | Is there a `packages/schemas/src/` module for this resource already, or does it need a new one?                  | Always — reuse beats adding                         |
| 1.4 | Server-side or client-side pagination? What page size?                                                           | Lists that could grow                               |
| 1.5 | Are filters applied server-side, or does everything arrive and get filtered in the browser?                      | Screens with non-trivial filtering                  |
| 1.6 | Which fields does the API support sorting on?                                                                    | Sortable tables                                     |
| 1.7 | Does this feature need a background job (BullMQ), or is it request/response only?                                | Anything long-running: imports, embeddings, digests |

**Automatic decisions (when not to ask):**

- Standard CRUD following the repo's existing REST shape → assume the conventional route
- A comparable query hook already exists → copy that pattern
- **If the route is not live:** infer the contract from the design + requirements + the closest
  existing `packages/schemas` module, mark it `Status: PENDING API validation`, and drive the
  hook from a local mock until the route ships
- **If the route is claimed to be live:** never assume it. It goes through the **G0 probe**
  against `http://localhost:3333`, on both registrations, demanding real JSON

---

## 2. State and Cache

Use when the state strategy is not obvious.

| #   | Question                                                                               | When to use                             |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| 2.1 | Can this screen's data be cached (stale-while-revalidate), or must it always be fresh? | Data that changes often                 |
| 2.2 | Is state shared with another screen (a selection that survives navigation)?            | Multi-step flows, wizards               |
| 2.3 | Should the form keep a draft?                                                          | Long or complex forms                   |
| 2.4 | Does this belong in the Zustand store, or is it feature-local?                         | Whenever cross-screen state is proposed |

**Automatic decisions:**

- Server state → TanStack Query; check the existing query-client defaults before inventing a `staleTime`
- Local state in the feature's hook. The Zustand store is a **single** store — only put something there with a real cross-feature reason

---

## 3. Permissions and Access

Use when the feature has visibility restrictions or conditional actions.

| #   | Question                                                                     | When to use                                                                     |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 3.1 | Is this screen public or session-gated?                                      | Every new screen — `/$username` is public, everything under `/dashboard` is not |
| 3.2 | Are any actions restricted (owner vs recruiter vs anonymous visitor)?        | When the design shows actions that may be conditional                           |
| 3.3 | Does a user without permission see a disabled screen, or nothing at all?     | When the "no access" behaviour is not in the design                             |
| 3.4 | Does the per-user **disclosure policy** constrain what this screen may show? | Anything rendering agent-published posts or employer information                |

**Automatic decisions:**

- Not mentioned → assume the existing pattern of the neighbouring route in `router.tsx`
- Never widen what the disclosure policy allows without an explicit decision recorded in `decisions.md`

---

## 4. Navigation and Routing

Use when the feature introduces a route or changes navigation.

| #   | Question                                                     | When to use                                                        |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| 4.1 | What is the route path?                                      | Every new screen                                                   |
| 4.2 | Where does it appear in the nav?                             | If the design does not show the navigation context                 |
| 4.3 | Is there deep linking (open a modal or tab via a URL param)? | When the design shows modals/tabs that could be addressed directly |
| 4.4 | Where does the user arrive from?                             | When the entry point is not obvious                                |

**Automatic decisions:**

- Route path: derive from the feature name in kebab-case, nested under the closest existing group
- Routing here is **code-based** — the route is a hand-written entry in `apps/web/src/router.tsx`. There is no generated route tree to regenerate.

---

## 5. Edge Cases and UX

Use to pin down behaviour the design does not cover.

| #   | Question                                              | When to use                             |
| --- | ----------------------------------------------------- | --------------------------------------- |
| 5.1 | What shows when the list is empty?                    | Every screen with a list                |
| 5.2 | What happens on an API error — inline, toast, retry?  | Only if the repo has no clear precedent |
| 5.3 | Is there a confirmation before destructive actions?   | Irreversible actions in the design      |
| 5.4 | What happens while a background job is still running? | Imports, embedding generation, digests  |
| 5.5 | Skeleton or generic spinner?                          | If the design shows a loading state     |

**Automatic decisions:**

- The four states are **not** an interview question — they are the repo standard. Use `RoutePending`, `RouteErrorState`, `RouteNotFound` from `shared-components/route-states.tsx` and `skeleton.tsx`
- Empty state: the `SURFACE_EMPTY` dashed placeholder from `surface.ts`

---

## 6. Scope and Boundaries

**Always include at least one question from this category** — it prevents scope creep.

| #   | Question                                                                                                                  | When to use                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 6.1 | What is OUT of scope for this delivery?                                                                                   | Always                                       |
| 6.2 | Is anything in the design phase 2 / nice-to-have?                                                                         | When the design is large                     |
| 6.3 | Does this replace something existing, or is it purely additive?                                                           | When there may be legacy code to remove      |
| 6.4 | Does this require touching a shared component in `shared-components/` or a `@repo/schemas` module other packages consume? | When the design implies changing a primitive |

**Automatic decisions:**

- Clear product requirements → the scope is exactly what is described, nothing more
- Anything in the design that is not in the requirements → mark it "Phase 2"
- Known deliberate debt (the eslint backlog, `apps/mcp` having no tests, the `pluguins/` typo) is **never** in scope by implication

---

## 7. Performance

Only for features with a plausible performance problem.

| #   | Question                                                     | When to use                      |
| --- | ------------------------------------------------------------ | -------------------------------- |
| 7.1 | How many items can the list hold? (10? 100? 10,000?)         | Lists and tables                 |
| 7.2 | Does it need virtualisation?                                 | >500 visible items               |
| 7.3 | Do images/media need lazy loading?                           | Image-heavy screens              |
| 7.4 | Does anything run in the browser worker (the TF.js re-rank)? | Search and match-scoring screens |

**Automatic decisions:**

- <100 items → no virtualisation, server-side pagination
- \>100 items → pagination is mandatory
- Images → always lazy loaded

---

## 8. External Dependencies

Use when the feature depends on something outside the web app.

| #   | Question                                                                              | When to use                                                   |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 8.1 | Is the API side of this ready? If not, is there a route/contract defined?             | Whenever a new endpoint is involved                           |
| 8.2 | Does it depend on another feature in flight?                                          | When scopes could collide                                     |
| 8.3 | Does it need a database migration or a `@repo/schemas` change other packages consume? | When the data model moves                                     |
| 8.4 | Does it need a funded `OPENAI_API_KEY` or docker Postgres to test?                    | Anything touching embeddings, search, or the pgvector indexes |

**Automatic decisions:**

- API not ready and no contract → **infer** the contract from the design + requirements + the nearest existing schema module, mark `Status: PENDING API validation`, drive the hook from a mock, and add a validation task
- API ready → generate the schema from the contract, then **run the G0 probe anyway**
- Any test that needs docker Postgres or a funded key is called out explicitly in `tasks.md`; those suites hang for 60-90s rather than failing fast when the infrastructure is not up

---

## Example generated interview

For a feature "Agent disclosure settings":

> **Interview — agent-disclosure-settings**
>
> I have read the requirements, the design and the repo architecture. Six questions to close the gaps:
>
> **1. [API] — Does `GET/PUT /api/v1/agent-policy` already exist, or is it still to be built?**
> Recommendation: treat it as live and run the G0 probe against `http://localhost:3333` on both the bare path and `/api/v1` before writing any UI task. If it does not answer real JSON, the spec falls back to an inferred contract plus a mock, with a validation task.
>
> **2. [Schemas] — Do we extend `packages/schemas/src/agent-policy/`, or add a new module?**
> Recommendation: extend the existing module. A second contract for the same endpoint will drift, and `apps/mcp` consumes this one too.
>
> **3. [Permissions] — Owner-only, or can anything read the policy?**
> Recommendation: owner-only under `/dashboard/settings`; the policy is read server-side when an agent publishes, never exposed on the public profile.
>
> **4. [Scope] — The design shows a per-employer override table. Is that in this delivery?**
> Recommendation: mark it Phase 2 — ship the global policy first.
>
> **5. [Variants] — Which members of the policy-level enum does this screen render?**
> Recommendation: all of them, enumerated from the zod enum in `packages/schemas/src/agent-policy/`, plus the unknown-value fallback. _(This one is not skippable — if unanswered, I assume the full enum and record the assumption in `decisions.md`.)_
>
> **6. [Edge case] — What does the screen show while a policy change is propagating?**
> Recommendation: optimistic update through TanStack Query, with the write confirmed by a postgres-mcp correlation-id check in the harness rather than trusting the 200.
