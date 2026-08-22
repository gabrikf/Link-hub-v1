# BUG-20260822-disclosure-cross-role: raising one job's disclosure level silently un-blocks every other employer's name

- **Status:** open
- **Impact (user-side):** Trust-Damage
- **Severity:** Critical · **Priority:** P0
- **Persona Affected:** Diego, the curating developer (harmed) — Atlas, the coding agent (actor)
- **Journey Step:** J-agent-posts, the step where the agent publishes a post attributed to a role
- **Theme:** n/a (api + public projection)
- **Scenarios:** none yet — found by a targeted api probe, not a written scenario
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0114, confirmed in run `2026-08-22T18:58:46.702Z`, iteration 4 (TRIAGE)

## Summary

Diego's account sits at `summary`: his agent may describe what he built, never who
for. One of his jobs is different — an open-source employer, or a client who has
already announced the work publicly — so he opens that single role and marks it
`full`. He has said one thing: *you may name this one*.

LinkHub hears something else. From that moment, any post his agent attributes to
that permissive role may name **every** employer in his history, including the one
under NDA that he deliberately left at `summary`. The post publishes straight to
his public profile and anonymous visitors read it.

The control makes the leak look impossible right up until it happens: the exact
same sentence, sent without a role attached, is refused with a clear 400.

## Reproduction

- **Charter:** none yet — direct api probe · **Tour:** the-back-door tour
- **Environment:** curl + psql, no browser · web http://localhost:5273 · api http://localhost:3344 · seed account `seed.node-backend.040@linkhub.local` / `12345678` (login `seed-node-backend-040`)

1. Confirm the shape the fixture already has:
   `SELECT login, agent_disclosure_level FROM users WHERE login='seed-node-backend-040'` → `summary`;
   `SELECT company_name, disclosure_level FROM work_experiences …` → Globo, iFood, PagBank inherit (NULL); **VTEX is overridden to `full`**.
2. `POST /auth/login`, then `POST /me/tokens` with `posts:write` to mint a PAT.
3. **Control.** `POST /me/posts` over the PAT, body `"Shipped a reconciliation ledger at PagBank this quarter."`, **no** `workExperienceId` → **HTTP 400**, `Post mentions "PagBank", which your disclosure level (summary) does not allow`.
4. **The leak.** The **identical** body plus `workExperienceId: "029da3d1-cf59-4c37-827b-48eb8624d758"` (the VTEX role) → **HTTP 201**, `"status": "published"`.
5. `curl http://localhost:3344/profile/seed-node-backend-040/posts` with **no authorization header** → the post naming PagBank is served to anonymous visitors.
6. `psql ... "SELECT status, body FROM posts WHERE id='e372b51c-0fb5-4246-bef4-1c4eae01ecef'"` → really stored, really `published`.

**Expected:** an employer whose own role is still at `summary` stays on the
denylist no matter which role the post is attributed to.
**Actual:** attributing the post to any `detailed`/`full` role empties the company
denylist entirely, so every other employer becomes publishable.

## Evidence

- `.nightly/evidence/CAND-0114/00-db-disclosure-state.txt` — the policy level in force, read from `users` / `work_experiences`.
- `.nightly/evidence/CAND-0114/01-control-no-workExperienceId-HTTP400.json` — the agent's call and the refusal.
- `.nightly/evidence/CAND-0114/02-attack-attributed-to-full-role-HTTP201.json` and `i4-201-attributed-to-full-role.json` — the same call with a role attached, accepted.
- `.nightly/evidence/CAND-0114/03-anonymous-public-profile-posts.json` and `i4-anonymous-public-read.json` — the raw payload from the **logged-out** public endpoint.
- `.nightly/evidence/disclosure-readpath/work-context-baseline.json` — the read side of the same defect: `GET /me/work-context` returns `disclosureLevel: "summary"` at the top while handing VTEX back in cleartext and redacting the other three to `[employer]`.
- Independent read path: the `posts` row was read back from postgres by the returned id, not inferred from the 201.

- **Re-reproduced independently at iteration 10 (TRIAGE), 2026-08-22, no server and no database involved.** A throwaway vitest file beside the module (written, run, deleted — nothing committed) drove the real functions: `resolveEffectiveLevel("summary", "full")` → `"full"`, and `buildBlockedTerms({ level: "full", companyNames: ["PagBank","Globo","VTEX"], userBlockedTerms: ["Projeto Fenix"] })` → `["Projeto Fenix"]` — every employer name gone. Then `assertPostRespectsDisclosure` with the body `"Shipped a reconciliation ledger at PagBank this quarter."` **threw when unattributed (control, still green) and returned silently when attributed to the `full` VTEX role.** 2 failed / 1 passed: the control failing to fail is what makes the other two meaningful.

**Two of the four disclosure-leak evidence items are text, not screenshots.** The
policy level came from the database rather than the settings screen, and the
public projection is the anonymous JSON payload rather than a rendered logged-out
profile. **Not observed in a browser this round.**

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — one permissive role publishes every other employer's name. *Cause* — `buildBlockedTerms()` in `apps/api/src/core/use-case/agent-policy/redact-work-disclosure.ts` takes a **scalar** `level` and returns the company names only when that one level is `summary`. Callers (`assertPostRespectsDisclosure` at `enforce-post-disclosure.ts:65-75`, `GetWorkContextUseCase.toRole`, `resolveConnectionDisclosure`) pass the effective level of the single attributed role, so a `detailed`/`full` role drops every company name including the other roles'. The denylist must be built **per role**: a company name belongs on it whenever *that* role's own effective level is `summary`, independent of the level in force for the post being written. The file's own intent agrees — the whole module exists because "don't name the client" in a tool description is a suggestion an LLM can ignore.
- **Root Cause (taxonomy):** disclosure-policy
- **Fix commit:** —
- **Regression test:** a unit test beside `apps/api/src/core/use-case/agent-policy/redact-work-disclosure.test.ts` — account `summary`, role A overridden to `full`, assert role B's company name is **still** on the denylist. Seen failing first (today the company names come back absent). Then an HTTP test through `build-test-app.ts` + `server.inject`: `POST /me/posts` with `workExperienceId` = the `full` role and another employer in the body → expect 400. These units are dependency-free by design (see the file header), so the unit layer is the honest first test.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
