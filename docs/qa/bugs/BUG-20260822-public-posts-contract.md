# BUG-20260822-public-posts-contract: every public profile that has a published post shows "Could not load posts. Please try again." to its visitors

- **Status:** open
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

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — the public Posts block always renders its error state. *Cause* — **contract drift between two schemas that were never reconciled.** `apps/api/src/infra/http/controllers/posts/posts-controller.ts:66` serves the public feed through `publicPostResponseSchema = postResponseSchema.omit({ metadata: true })`, and that omission is **deliberate and correct** — the file's own comment explains that `metadata` is the one field on a post that can still carry a repository name, so the public projection drops it rather than trusting every writer. Meanwhile `apps/web/src/lib/post-queries.ts:75` parses that response with `postSchema`, whose `metadata: z.record(z.string(), z.unknown()).nullable()` (`packages/schemas/src/posts/index.ts:31`) is nullable but **not** optional, therefore required. Every row fails, the query function throws, and `apps/web/src/features/profile/components/profile-blocks.tsx:688` renders the error copy.
- **Root Cause (taxonomy):** api-contract
- **Direction for the fix (decided at triage, contract-first per AGENTS.md):** add a `publicPostSchema` to `packages/schemas/src/posts/index.ts` — `postSchema.omit({ metadata: true })` — build schemas, then have **both** sides use it: the api's `publicPostResponseSchema` derives from it and `fetchPublicPosts` parses with it. Two rules constrain this and both were checked at triage:
  - **Do not** widen `postSchema.metadata` to `.optional()`. AGENTS.md forbids widening a schema so a bad payload passes, and it would let a genuinely malformed private payload through as well.
  - **Do not** put `metadata` back on the public projection. Iteration 5 recorded that decision deliberately and the privacy argument for it is in the controller's comment.
- **Fix commit:** —
- **Regression test:** contract test first — `.parse()` a **real captured payload** from `GET /profile/:username/posts` through the schema the web client uses (the captured payload is already saved in this bug's evidence directory). AGENTS.md names this the strongest sensor in the repo. Put it beside the posts schema in `packages/schemas` or with the posts-controller tests. A `@testing-library/react` test on the Posts block would only prove the error state renders on a throw, which is not the defect. `e2e/journeys/02-agent-posts.spec.ts` already covers the user-visible half.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
