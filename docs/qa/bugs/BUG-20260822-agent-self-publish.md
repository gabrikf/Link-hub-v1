# BUG-20260822-agent-self-publish: an agent holding a PAT can publish its own post straight out of the review queue

- **Status:** open
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

1. Mint a PAT through `/dashboard/settings` → Advanced settings → Create token.
2. Through the MCP server, `create_post` so the post lands in `pending_review`.
3. Through the MCP server, `update_post { id, status: "published" }`.
4. The post is public. The human never approved it.

**Expected:** a `pending_review` post can only be released by the human, through
the review queue. A PAT caller attempting the transition is refused.
**Actual:** MCP returns `Post updated ✅ … status: published` and the post is
publicly visible.

## Evidence

- `e2e/journeys/02-agent-posts.spec.ts:635` — the assertion that recorded it, written by the journey-02 agent driving the real MCP server.
- **Not re-reproduced in run `2026-08-22T18:58:46.702Z`.** It is carried in from the hand-off on the strength of that e2e assertion plus the code reading below. FIX must reproduce it first, before changing anything.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — an agent publishes its own post. *Cause* — `apps/api/src/core/use-case/posts/shared/post-status-rules.ts`, `ALLOWED_STATUS_TRANSITIONS` permits `pending_review → published` with no `authType` check, so a PAT-authenticated caller clears the same gate a session user does.
- **Root Cause (taxonomy):** missing-authorization
- **Fix commit:** —
- **Regression test:** unit test next to the use case in `apps/api/src/core/**` — a PAT-authenticated `pending_review → published` transition must be refused, a session-authenticated one must still be allowed. Then an HTTP-level test through `build-test-app.ts` + `server.inject`. The e2e assertion already covers the user-visible half.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
