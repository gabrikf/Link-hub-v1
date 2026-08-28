# BUG-20260822-agent-self-publish: an agent holding a PAT can publish its own post straight out of the review queue

- **Status:** verified (red `dd136ee`, fixed `b93853b`, review approved 2026-08-22 by the nightly REVIEW_FIX pass, iteration 21)
- **Impact (user-side):** Consent bypass — machine-authored content about the user's real work goes public without them
- **Severity:** High · **Priority:** P1
- **Persona Affected:** Diego, the curating developer (harmed) · Atlas, the coding agent (the actor)
- **Journey Step:** J-agent-posts, the step where a machine-authored post waits in `/dashboard/posts/review` for a human decision
- **Theme:** n/a (server-side rule)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `BUG-20260822-agent-self-publish`, carried in from the QA hand-off, confirmed into run `2026-08-22T18:58:46.702Z` at iteration 4 (TRIAGE)

## Summary

The whole point of the review queue is that nothing an agent writes about a
developer's work becomes public until that developer says so. The UI states it
("Nothing here is public until you approve it") and the approve endpoint's own
documentation states it ("the only way a machine-authored post becomes public").

Neither is true. A PAT-authenticated caller can `update_post { id, status:
"published" }` on its own `pending_review` post and release it. The consent gate
is a convention, not an enforced rule: the status-transition table is checked
without ever asking who the caller is.

## Reproduction

- **Charter:** none yet · **Tour:** the-agent tour (MCP over stdio, no browser)
- **Environment:** api :3333 · `apps/mcp` over stdio JSON-RPC · any seeded developer (`bash db-manage.sh seed-all`)

1. Mint a PAT with scope `posts:write` — `/dashboard/settings` → Advanced
   settings → Create token (`POST /me/tokens`).
2. `POST /me/posts` over that PAT with `{ source: "mcp", status:
   "pending_review" }` (the MCP `create_post` tool). → `201`, status
   `pending_review`. The post now sits in `/dashboard/posts/review`, under
   "Nothing here is public until you approve it".
3. **Path A** — `PATCH /me/posts/:id` over the *same* PAT with `{ status:
   "published" }` (the MCP `update_post` tool). → `200`, stored status
   `published`, `publishedAt` stamped.
4. **Path B** — `POST /me/posts/:id/approve` over the *same* PAT. → `200`,
   stored status `published`. The agent calls the human's own consent endpoint.
5. `GET /profile/:login/posts` anonymously → `200` with the post in the feed.

**Expected:** a `pending_review` post can only be released by the human, through
the review queue. A PAT caller attempting the transition is refused, by either
route.
**Actual:** both routes return `200` and the post is publicly visible.

### Path B was not in the original report

The approve endpoint is guarded only by `apiAccessGuard("posts:write")`, which a
PAT satisfies, and `posts-controller.ts:249` never forwards
`request.user.authType` — `IApprovePostInput` has no such field. So the endpoint
whose own OpenAPI description says it is "the only way a machine-authored post
becomes public" is itself callable by the machine. A fix that only hardens
`PATCH` is bypassed in one request.

### Scope note — do not widen this to the create path

`POST /me/posts` over a PAT already defaults to `status: "published"`
(`packages/schemas/src/posts/index.ts:58`, `create-post.use-case.ts:60`), and
every `apps/mcp` tool description says so. An agent that never opts into
`pending_review` is unaffected by this bug *and* by its fix. Forcing PAT-created
posts to `pending_review` is a product-behaviour change that would break agents
posting directly — a morning decision, not a nightly fix. Likewise leave
`draft → published` over a PAT alone: a draft was never presented to the human as
awaiting a decision. **The gate that must hold is narrow: once a post IS
`pending_review`, only a human session releases it.**

## Evidence

- `e2e/journeys/02-agent-posts.spec.ts:635` — the assertion that first recorded it, written by the journey-02 agent driving the real MCP server.
- **Re-reproduced at branch tip `d9f66c7` on 2026-08-22 (iteration 19, TRIAGE)**, hermetically through `buildTestApp()` + `server.inject` — no database, no live server, the real guards / zod / error handler. Path A `200` → stored `published`; Path B `200` → stored `published`; anonymous public feed `200` with the post body; human-JWT approve `200` (the control that must keep passing).
- Probe and raw output: `.nightly/evidence/i19-agent-self-publish-probe.mts`, `.nightly/evidence/i19-agent-self-publish-output.txt`.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — an agent publishes its own post. *Cause* — `apps/api/src/core/use-case/posts/shared/post-status-rules.ts:80`, `assertPostStatusTransition()` takes no `authType`, so `pending_review → published` passes identically for both caller kinds. Two callers reach it and **both need fixing**: `update-post.use-case.ts:101` (has `input.authType` and ignores it here) and `approve-post.use-case.ts:47` (`IApprovePostInput` has no `authType` field, and `posts-controller.ts:249` never passes one).
- **Root Cause (taxonomy):** missing-authorization
- **Fix commit:** `b93853b` (red `dd136ee`). The recommended shape was taken: a **second, separate** rule rather than a change to the transition table. `assertReviewReleaseIsHumanConsent(from, to, authType)` in `post-status-rules.ts` throws `ForbiddenError` for exactly `pat` + `pending_review → published`, and nothing else. `assertPostStatusTransition` is untouched, so approval itself — which *is* that transition — still works for a person. Both callers are wired: `update-post.use-case.ts` already had `input.authType`; `approve-post.use-case.ts` got an optional `authType` on `IApprovePostInput`, forwarded from `posts-controller.ts`. In the approve use case the new check sits **after** the `post.status === "published"` early return, so a retried approve after a lost response is still an idempotent `200`, not a fresh `403`. Two false descriptions were corrected in the same commit — the approve route's OpenAPI text and the MCP `update_post` `status` description — because both told the caller the move it now refuses was available.
- **Regression test:** pure rule next to the use case in `apps/api/src/core/**` — a `pat` caller's `pending_review → published` must be refused, a `jwt` caller's must still be allowed. Then HTTP through `build-test-app.ts` + `server.inject` in `apps/api/src/infra/http/controllers/posts/test/`: `PATCH` over a PAT → refused, `POST /approve` over a PAT → refused, plus **two positive controls that must stay green** — human JWT approve → `200`, and a PAT `draft → published` → `200` (unchanged by design, see the scope note). The e2e assertion at `e2e/journeys/02-agent-posts.spec.ts:635` covers the user-visible half.
- **Status code:** `ForbiddenError` (403), not `BadRequestError` — the move is legal for this post, the *caller* is the thing that is not allowed to make it. That is the distinction `assertPostStatusTransition`'s own doc comment already draws, so it argues for a separate caller check rather than widening the existing 400.
- **Gate:** `guardrails PASS` recorded at `b93853b`. Re-checked independently at review: `npm run build:schemas` clean, `npm run check-types` 8/8 successful, `lint-changed` clean over 22 changed files (1 known recorded finding ignored).

## Verification

**Red proved, then green, by checking out the commits — not by trusting the message.**

- At `dd136ee` (tests only, no production change): **5 failed / 74 passed**. Every failure is the symptom itself, not a broken harness — the two use-case tests report `promise resolved "PostEntity{…}" instead of rejecting`, the two HTTP tests report `expected 200 to be 403`, and the feed test reports the post present (`expected […] to have a length of +0 but got 1`).
- At `b93853b`: **79 passed / 0 failed** across the same three files.
- The **positive controls were already green at the red commit**, so the fix could not buy its green by breaking approval: human-JWT `POST /approve` → `200` with the text intact, PAT `draft → published` → `200`, PAT re-sending `pending_review` → no-op.

**The HTTP lane is not a mock.** `posts.e2e.test.ts` mints a **real PAT through the real `POST /me/tokens` route**, creates the post through the real `POST /me/posts`, drives both attack paths through the real routes and guards, and then reads `GET /profile/:login/posts` **anonymously** — so the user-visible harm ("the post body is in the public feed") is what is asserted gone, not just an internal flag.

**Blast radius, checked by search rather than assumed.** Only two places in `apps/api/src` write `status: "published"` on a post — the update use case and the approve use case — and both now carry the caller kind. The `pending_review → draft` launder is already refused by the existing transition table (test present and green), so there is no two-step route around the new rule. The activity digest calls `CreatePostUseCase` with `authType: "pat"`, which is the create path and deliberately out of scope; its suite plus every posts use case re-ran green (**19 files / 239 tests**). The web review queue calls `/approve` over the session JWT, so the human path is untouched — `apps/web` has no change and nothing visual changed, so no theme or four-state work applies.

**Contract integrity.** No file under `packages/schemas/src/**` changed and no schema was widened; `authType` is an internal use-case input, not a wire shape. The MCP `update_post` input schema correctly still accepts `pending_review` — re-sending it is a legal no-op and `draft → published` still needs `published`.

**Documentation left consistent.** Every other place that describes this behaviour to an agent — `apps/mcp/src/tools/create-post.ts`, `create-commit-summary-post.ts`, `resources/post-guidelines.ts`, and the web's own "stay there until you approve them" copy — already said the post stays private until the human approves, so the fix makes them true rather than leaving them stale. `apps/mcp` has no `approve` tool.

**Recorded, not blocking:**

- `assertReviewReleaseIsHumanConsent` defaults `authType` to `"jwt"`, i.e. a caller that forgets to thread the credential silently skips the gate. That is the convention the neighbouring `assertMachineAuthoredPostIsImmutable` already uses in the same file, both real callers pass it, and requiring it would force internal callers to invent a credential — so it ships, but a third caller added later must be checked for it.
- The MCP client wraps a `403` as "Your LinkHub token is not allowed to perform this action (*server message*). Ensure it has the posts:write / posts:read scopes." The actionable server message does reach the agent, but the generic scope advice trailing it is wrong for this case and could send an agent off to mint a new token. Pre-existing wrapper behaviour in `api-client.ts:190`, shared with the immutability 403 — not introduced here.

**Not verified.** No walk through a running LinkHub api or a browser: port 3333 serves an unrelated project for this whole run, so steps 1–5 of the reproduction were exercised through `buildTestApp` + `server.inject` (the same api code the MCP tools call) rather than over the network, and `apps/mcp` itself was never started — the corrected `update_post` description has not been seen by a real MCP client. No row in `linkhub_dev` was written or read for this bug; the rule is pure use-case logic that sits above the repository, and the in-memory and Drizzle repositories are interchangeable for it. `e2e/journeys/02-agent-posts.spec.ts:635` already asserts the fixed behaviour but Playwright needs the live stack and was not run.
