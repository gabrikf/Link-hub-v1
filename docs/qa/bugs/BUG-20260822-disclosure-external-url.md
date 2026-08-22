# BUG-20260822-disclosure-external-url: an agent can publish the employer's name in a public link while the disclosure policy says it may not

- **Status:** open
- **Impact (user-side):** Trust-Damage
- **Severity:** Critical · **Priority:** P0
- **Persona Affected:** Diego, the curating developer (harmed) — Atlas, the coding agent (actor)
- **Journey Step:** J-agent-posts, the step where the agent publishes a post through MCP
- **Theme:** n/a (api + public projection)
- **Scenarios:** none yet — this was found by a targeted api probe, not a written scenario
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0115, confirmed in run `2026-08-22T18:58:46.702Z`, iteration 4 (TRIAGE)

## Summary

Diego keeps his agent disclosure level at `summary` — the default, whose whole
promise is "describe the work, never say who it was for". He has watched the
policy hold: when his agent tried to write "shipped a ledger at PagBank", LinkHub
refused with a clear 400 and the agent rewrote the sentence. He trusts the gate.

Then the agent attaches the pull request it just read. The URL is
`https://github.com/pagbank-internal/pix-ledger/pull/4471`. LinkHub accepts it,
publishes the post immediately, and renders that URL as the post's clickable link
on his public profile — where a recruiter, or his current employer, reads it.

The employer name that is a hard error in the sentence is published, unchallenged,
in the link beside it. Nobody reviews it first: the MCP `create_post` path defaults
to `status: "published"`.

## Reproduction

- **Charter:** none yet — direct api probe · **Tour:** the-back-door tour (same input, a different field)
- **Environment:** curl + psql, no browser · web http://localhost:5273 · api http://localhost:3344 · seed account `seed.node-backend.040@linkhub.local` / `12345678` (login `seed-node-backend-040`)

1. Confirm the policy state: `docker exec linkhub-postgres-dev psql -U linkhub_user -d linkhub_dev -c "SELECT login, agent_disclosure_level FROM users WHERE login='seed-node-backend-040'"` → `summary`, and the same user has a `work_experiences` row with `company_name = 'PagBank'`.
2. `POST /auth/login`, then `POST /me/tokens` with scopes `["posts:write"]` to mint a PAT — this is exactly what a user hands their coding agent.
3. **Control.** `POST /me/posts` over the PAT with `body: "Shipped a reconciliation ledger at PagBank this quarter."` → **HTTP 400**, `Post mentions "PagBank", which your disclosure level (summary) does not allow`.
4. **The hole.** The same request with a *clean* title, body and tags, plus
   `externalUrl: "https://github.com/pagbank-internal/pix-ledger/pull/4471"` → **HTTP 201**, `"status": "published"`.
5. `curl http://localhost:3344/profile/seed-node-backend-040/posts` with **no authorization header** → the post is returned to anonymous readers with the URL intact.
6. `psql ... "SELECT external_url, status FROM posts WHERE id='48c7d46c-65b1-4d21-9779-601ef66897bb'"` → the row really is stored, really `published`.

**Expected:** every field of a machine-authored post that reaches a public reader
goes through `findDisclosureViolations`. `externalUrl` is part of
`publicPostResponseSchema` and is rendered as the post's `<a href>`, so it must be
scanned like `title`, `body` and `tags`.
**Actual:** `externalUrl` — and `coverImageUrl` and `images`, on the same line of
code — are never scanned. Blocking the body while publishing the same string in
the link beside it is not enforcement.

## Evidence

- `.nightly/evidence/CAND-0115/01-externalUrl-not-scanned-HTTP201.json` — the agent's tool call and the 201 it got.
- `.nightly/evidence/CAND-0115/i4-201-employer-in-externalUrl.json` — re-run at triage, id `48c7d46c-…`.
- `.nightly/evidence/CAND-0115/i4-anonymous-public-read.json` — the raw payload for that same post from the **logged-out** public endpoint.
- `.nightly/evidence/CAND-0115/02-patch-externalUrl-by-PAT-HTTP403-correctly-blocked.json` — the one path that *is* closed: `PATCH /me/posts/:id` over a PAT is correctly refused ("content is immutable by design"). Recorded so nobody re-probes it.
- Independent read path: the `posts` row was read back from postgres by the id returned in step 4, not inferred from the 201.

**Two of the four disclosure-leak evidence items are text, not screenshots.** The
policy level was read from the `users` table rather than captured on the settings
screen, and the public projection was captured as the anonymous JSON payload
rather than as a rendered logged-out profile. The render is asserted from code
(`apps/web/src/features/profile/components/profile-blocks.tsx:704` uses
`externalUrl` as the post's `href`), **not observed in a browser this round.**

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — an employer name is published in a public link at `summary`. *Cause* — `assertPostRespectsDisclosure` builds its haystack from `[title, body, ...tags]` only (`apps/api/src/core/use-case/agent-policy/enforce-post-disclosure.ts:81-85`), and `PostDisclosureContent` (same file, lines 14-18) does not model `externalUrl` / `coverImageUrl` / `images` at all. The word-boundary matcher would have matched `pagbank-internal` correctly (`-` is not a letter, digit or underscore), so this is a **missing field, not a weak matcher** — do not "fix" it by tightening the regex.
- **Root Cause (taxonomy):** disclosure-policy
- **Fix commit:** —
- **Regression test:** a unit test beside `apps/api/src/core/use-case/agent-policy/enforce-post-disclosure.test.ts` — account level `summary`, company `PagBank`, clean title/body/tags, `externalUrl` containing `pagbank-internal` → expect `BadRequestError`. It must be seen failing first (today the function returns silently). Then an HTTP test through `build-test-app.ts` + `server.inject` on `POST /me/posts` over a PAT asserting 400.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
