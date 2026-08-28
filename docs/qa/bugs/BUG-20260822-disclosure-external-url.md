# BUG-20260822-disclosure-external-url: an agent can publish the employer's name in a public link while the disclosure policy says it may not

- **Status:** verified (fixed `b65d6d5`, review approved 2026-08-22 by the nightly REVIEW_FIX pass)
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

- **Root cause:** *symptom* — an employer name is published in a public link at `summary`. *Cause* — `assertPostRespectsDisclosure` builds its haystack from `[title, body, ...tags]` only (`apps/api/src/core/use-case/agent-policy/enforce-post-disclosure.ts:81-85`), and `PostDisclosureContent` (same file, lines 14-18) does not model `externalUrl` / `coverImageUrl` / `images` at all. The word-boundary matcher would have matched `pagbank-internal` correctly (`-` is not a letter, digit or underscore), so this is a **missing field, not a weak matcher** — do not "fix" it by tightening the regex.
- **Root Cause (taxonomy):** disclosure-policy
- **Fix commit:** `b65d6d5` (red first in `c547eae`). `PostDisclosureContent` now models `externalUrl` / `coverImageUrl` / `images` and the haystack includes them; `create-post.use-case.ts` and `update-post.use-case.ts` pass them, the update path through `afterPatch` so a partial patch is checked against the full resulting post. The matcher was **not** touched. `metadata` is deliberately still excluded and the code now says why (`publicPostResponseSchema` omits it; the digest path, its only writer, scans it in `assertTemplateIsClean`).
- **Regression test:** a unit test beside `apps/api/src/core/use-case/agent-policy/enforce-post-disclosure.test.ts` — account level `summary`, company `PagBank`, clean title/body/tags, `externalUrl` containing `pagbank-internal` → expect `BadRequestError`. It must be seen failing first (today the function returns silently). Then an HTTP test through `build-test-app.ts` + `server.inject` on `POST /me/posts` over a PAT asserting 400.
- **Gate:** `guardrails PASS` — `build @repo/schemas`, `check-types (affected)`, `lint (changed files, ratcheted)`, `test — api` (docker up, actually run), `test — other workspaces (affected)`. `i18n locale parity` skipped by design: LinkHub has no locale files.

## Verification

Reviewed independently on 2026-08-22 (nightly run `2026-08-22T18:58:46.702Z`,
iteration 6). **Verdict: approved.**

**Red-then-green, proved rather than quoted.** At `c547eae` the unit file is
5 failed / 2 passed, every failure `expected function to throw an error, but it
didn't` — the defect itself, not an import or fixture error — and the e2e file
is 3 failed / 23 passed with `expected 201 to be 400`. On the fix commit both
files are green, 33/33. The tests that already passed at red are the clean-URL
controls, and they stayed green: the fix did not buy its pass by widening the
matcher.

**Re-walked from a real entry point,** against a server built from the fix and
the real dev Postgres, over a freshly minted PAT for `seed-node-backend-040`
(`agent_disclosure_level = summary`):

| Attempt | Result |
|---|---|
| employer in `externalUrl` | **400** — names `"PagBank"` |
| employer in `coverImageUrl` | **400** — names `"Globo"` |
| employer in `images[]` | **400** — names `"iFood"` |
| a role whose own level is `full`, post **not** attributed to it | **400** — names `"VTEX"` (correct: the override applies only to the role the post names) |
| clean `externalUrl` | **201**, published |
| PAT `PATCH` adding an employer `externalUrl` to a **manual** post | **400** — the second hole, in the update path |

`SELECT id, status, external_url, cover_image_url, images FROM posts WHERE
user_id = '8974dfbf-…'` after the run returned only the two clean control rows;
both were deleted and the review PAT revoked, so the seed account is back to
0 posts and 2 seeded tokens.

**Not verified:** nothing here was observed in a browser. The public render is
still asserted from code (`profile-blocks.tsx:704`), and both themes were not
checked — the change is server-side only and has no UI surface, so there was
nothing visual to check. The known limitation below is untested by design.

**Known limitation carried forward (`CAND-0116`, not a regression):** the
denylist is matched literally, so a **multi-word** employer (`"Acme Corp"`)
still does not match its URL slug (`acme-corp`). Every single-token name is
caught. Fixing it means generating slug variants per term, which carries a
false-positive risk and needs its own triage.
