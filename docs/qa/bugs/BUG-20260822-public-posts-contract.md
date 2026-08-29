# BUG-20260822-public-posts-contract: every public profile that has a published post shows "Could not load posts. Please try again." to its visitors

- **Status:** verified (fixed `ce33083`, review approved 2026-08-22 by the nightly REVIEW_FIX pass)
- **Impact (user-side):** Trust-Damage
- **Severity:** Critical · **Priority:** P0
- **Persona Affected:** Sam, the reader who arrives cold (and, through him, Nina and Diego — it is *their* profile that looks broken)
- **Journey Step:** J-public-profile, the step where a stranger reads the developer's posts
- **Theme:** both (the defect is a failed parse, not a style)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `confirmed[]`, carried in from a prior hand-off; **re-reproduced from scratch** in run `2026-08-22T18:58:46.702Z`, iteration 7 (TRIAGE)

## Summary

A developer publishes a post — the one thing this product exists to produce — and
puts their profile link in their bio. Every visitor who opens it sees a red error
where the posts should be: *"Could not load posts. Please try again."* Trying
again does not help; the posts never appear for anyone, including the owner
viewing their own public page.

The failure is silent to the person who caused it. A profile with **no** posts
renders perfectly, so nothing looks wrong until the moment someone actually
publishes — which is exactly the moment they start sharing the link. The api is
healthy and answers `200` with correct data; the browser throws the data away.

## Reproduction

- **Charter:** none yet · **Tour:** the-stranger tour
- **Environment:** any browser, both themes · web `http://localhost:5273` · api `http://localhost:3344` (**not** 5173/3333 — those ports belong to a different project on this machine, see `docs/nightly-loop.md`) · account `gabrielkochf`, which has 3 published posts

1. Sign in as any developer and publish at least one post.
2. Sign out (or open a private window) and go to `/profile/<username>`.
3. Wait ~12s while react-query exhausts its three retries.
4. The Posts block renders **"Could not load posts. Please try again."**

**Expected:** the published posts render on the public profile.
**Actual:** the error state renders, on every load, for every visitor.

## Evidence

- `.nightly/evidence/BUG-20260822-public-posts-contract/i7-live-payload-gabrielkochf.json` — the real anonymous response: `HTTP 200`, 3 valid rows.
- `.nightly/evidence/BUG-20260822-public-posts-contract/i7-schema-parse-fails.json` — that exact payload run through `postSchema.array()`, the call the web client makes at `apps/web/src/lib/post-queries.ts:75`. Three issues, one per row: `invalid_type: expected record, received undefined` at `[n].metadata`.
- `.visual/bug-public-posts.png` — the rendered error state (captured by the hand-off round).
- Independent read path: the payload was fetched with **no auth header** at all, so this is what a stranger's browser receives, not a session artefact.

## Fix

- **Root cause:** *symptom* — the public Posts block always renders its error state. *Cause* — **contract drift between two schemas that were never reconciled.** `apps/api/src/infra/http/controllers/posts/posts-controller.ts:66` serves the public feed through `publicPostResponseSchema = postResponseSchema.omit({ metadata: true })`, and that omission is **deliberate and correct** — the file's own comment explains that `metadata` is the one field on a post that can still carry a repository name, so the public projection drops it rather than trusting every writer. Meanwhile `apps/web/src/lib/post-queries.ts:75` parses that response with `postSchema`, whose `metadata: z.record(z.string(), z.unknown()).nullable()` (`packages/schemas/src/posts/index.ts:31`) is nullable but **not** optional, therefore required. Every row fails, the query function throws, and `apps/web/src/features/profile/components/profile-blocks.tsx:688` renders the error copy.
- **Root Cause (taxonomy):** api-contract
- **Direction for the fix (decided at triage, contract-first per AGENTS.md):** add a `publicPostSchema` to `packages/schemas/src/posts/index.ts` — `postSchema.omit({ metadata: true })` — build schemas, then have **both** sides use it: the api's `publicPostResponseSchema` derives from it and `fetchPublicPosts` parses with it. Two rules constrain this and both were checked at triage:
  - **Do not** widen `postSchema.metadata` to `.optional()`. AGENTS.md forbids widening a schema so a bad payload passes, and it would let a genuinely malformed private payload through as well.
  - **Do not** put `metadata` back on the public projection. Iteration 5 recorded that decision deliberately and the privacy argument for it is in the controller's comment.
- **Fix commit:** `ce33083` (red first in `16ea93f`). `publicPostSchema = postSchema.omit({ metadata: true })` now lives in `packages/schemas/src/posts/index.ts`; the api's `publicPostResponseSchema` is `publicPostSchema.extend(workExperienceIdField)` and `fetchPublicPosts` parses with `publicPostSchema.array()`, returning the new `PublicPost` type. The wire payload is byte-identical to before — the fix moves *where the projection is declared*, from a private const inside one controller to the shared contract both sides read. Neither rejected option was taken: `metadata` was **not** put back on the public route, and `postSchema.metadata` was **not** widened to `.optional()`.
- **Regression test:** contract test first — `.parse()` a **real captured payload** from `GET /profile/:username/posts` through the schema the web client uses (the captured payload is already saved in this bug's evidence directory). AGENTS.md names this the strongest sensor in the repo. Put it beside the posts schema in `packages/schemas` or with the posts-controller tests. A `@testing-library/react` test on the Posts block would only prove the error state renders on a throw, which is not the defect. `e2e/journeys/02-agent-posts.spec.ts` already covers the user-visible half.
- **Gate:** `guardrails PASS`, on the fix commit and again on re-review (exit 0; the re-run replays Turbo cache for the unchanged lanes, so the review also ran `apps/web` `post-queries.test.ts` and `apps/api` `posts.e2e.test.ts` directly). `i18n locale parity` skipped by design: CraftHub has no locale files. The fix run's api lane narrowed itself and said so — 3 `OPENAI_API_KEY`-bound files (`search-indexes.e2e`, `search-boundaries.e2e`, `search.e2e`) skipped, pre-existing and unrelated to this change.

## Verification

Reviewed independently on 2026-08-22 (nightly run `2026-08-22T18:58:46.702Z`,
iteration 9). **Verdict: approved.**

**Red-then-green, proved rather than quoted.** `@repo/schemas` was rebuilt at
each end so neither run read a stale `dist/`. At `16ea93f` the web file is
2 failed / 1 passed, and the failure is the defect itself — `invalid_type:
expected record, received undefined` at `[0..2].metadata`, thrown from
`postSchema.array().parse` at `post-queries.ts:75` — not an import, selector or
fixture error. The third test (route + limit/offset forwarding) passed at red
and stayed green, so the fix did not buy its pass by loosening the assertion.
On `ce33083` the same file is 3/3, and `apps/api` `posts.e2e.test.ts` is 22/22.

**The bug's own reproduction, re-walked from a real entry point** against the
running dev servers (web `:5273`, api `:3344`), signed out, both themes:

| Check | Result |
|---|---|
| `GET /profile/gabrielkochf/posts`, no auth header | `200`, 3 rows, **no `metadata` key** on any row |
| that live payload through `postSchema.array()` | rejects all 3 rows at `[n].metadata` — the bug is still real against the old schema |
| that live payload through `publicPostSchema.array()` | parses, and no `metadata` survives the parse |
| `/profile/gabrielkochf` rendered, light **and** dark | all 3 post titles render; **no** "Could not load posts"; 0 console errors; no 4xx/5xx |
| `/profile/seed-react-frontend-003` (no posts), both themes | "No posts published yet" — the empty state is intact, not collateral damage |

**Reviewed as a change, not just as a green test.** The schema moved first and
was rebuilt, per AGENTS.md's contract-first rule; `omit` **narrows** the shape,
so nothing was widened to let a bad payload pass. No type assertion,
`eslint-disable`, `.skip`, swallowed error or timing hack appears in the diff.
The commit touches 4 files and nothing else — no drive-by renames or
reformatting. The api test change is purely additive (one new `it`); no existing
test was edited to make the fix pass. Blast radius: `publicPostSchema` and
`fetchPublicPosts` have exactly the callers listed above, the two places that
read `post.metadata` (`post-format.ts`, `review-queue-item.tsx`) are owner-only
views fed by `postSchema`, and `apps/mcp` never parses this route.
`npm run check-types` and `lint-changed` are both clean. The Posts block still
handles all four states (loading skeleton, empty, error, filled) — three of them
observed live this pass.

One deliberate narrowing is worth recording: the public route's
`workExperienceId` went from `z.string()` to `z.string().uuid()` (it now reuses
`workExperienceIdField` instead of `postResponseSchema`'s looser copy). The
column is `uuid` with a foreign key to `work_experiences(id)`, so no stored row
can violate it — checked with `\d posts` on the dev database.

**Not verified:** the Playwright journey `e2e/journeys/02-agent-posts.spec.ts`
was not run this pass (the fix's own vitest sensors cover the same contract, and
the rendered page was checked directly instead). The error state was not forced
live — it is covered by `posts-block.test.tsx` and its copy is unchanged by this
fix. `npm run visual:run` remains unusable on this machine for reasons unrelated
to this change: the bundled scenario still points at api `:3333`, another
project's port (see `.nightly/MEMORY.md`, iteration 8).
