# BUG-20260822-disclosure-cross-role: raising one job's disclosure level silently un-blocks every other employer's name

- **Status:** verified (fixed `faef823`, review approved 2026-08-22 by the nightly REVIEW_FIX pass)
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

CraftHub hears something else. From that moment, any post his agent attributes to
that permissive role may name **every** employer in his history, including the one
under NDA that he deliberately left at `summary`. The post publishes straight to
his public profile and anonymous visitors read it.

The control makes the leak look impossible right up until it happens: the exact
same sentence, sent without a role attached, is refused with a clear 400.

## Reproduction

- **Charter:** none yet — direct api probe · **Tour:** the-back-door tour
- **Environment:** curl + psql, no browser · web http://localhost:5273 · api http://localhost:3344 · seed account `seed.node-backend.040@crafthub.local` / `12345678` (login `seed-node-backend-040`)

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

- **Root cause:** *symptom* — one permissive role publishes every other employer's name. *Cause* — `buildBlockedTerms()` in `apps/api/src/core/use-case/agent-policy/redact-work-disclosure.ts` takes a **scalar** `level` and returns the company names only when that one level is `summary`. Callers (`assertPostRespectsDisclosure` at `enforce-post-disclosure.ts:65-75`, `GetWorkContextUseCase.toRole`, `resolveConnectionDisclosure`) pass the effective level of the single attributed role, so a `detailed`/`full` role drops every company name including the other roles'. The denylist must be built **per role**: a company name belongs on it whenever *that* role's own effective level is `summary`, independent of the level in force for the post being written. The file's own intent agrees — the whole module exists because "don't name the client" in a tool description is a suggestion an LLM can ignore.
- **Root Cause (taxonomy):** disclosure-policy
- **Fix applied (`faef823`, red at `bea6b1b`):** the level is now **per employer, never one scalar for the whole list**. A new `DisclosureCompany { name, level }` pairs each employer with the level of *its own* role, and `resolveDisclosureCompanies()` builds that list once so the write path, the read path and the digest path cannot disagree. An employer is blocked exactly when its own role resolves to `summary`. Attribution no longer feeds the denylist at all, which is why the bug cannot return through a different attribution path. All three non-test callers moved in the one commit — `enforce-post-disclosure.ts` (write), `get-work-context.use-case.ts` (read, which was leaking identically through `GET /me/work-context`), `resolve-connection-disclosure.ts` (digest). The signature was **broken on purpose**: a backwards-compatible overload would have let a caller stay on the old shape and keep the bug.
- **Two deliberate decisions, both pinned by a test and both upheld at review:** (1) a role the user raised to `full` may now be named in a post attributed to **no** role — a loosening, and a coherent one, because `get-work-context.use-case.ts:242` already hands that role's `companyName` back in cleartext regardless of attribution, so the write gate had been refusing text the read side was simultaneously supplying; (2) the refusal message was reworded, because "your disclosure level (full) does not allow" had become false — `full` does allow it, the *other* role's `summary` is what blocks it.
- **Fix commit:** `faef823`
- **Regression test:** a unit test beside `apps/api/src/core/use-case/agent-policy/redact-work-disclosure.test.ts` — account `summary`, role A overridden to `full`, assert role B's company name is **still** on the denylist. Seen failing first (today the company names come back absent). Then an HTTP test through `build-test-app.ts` + `server.inject`: `POST /me/posts` with `workExperienceId` = the `full` role and another employer in the body → expect 400. These units are dependency-free by design (see the file header), so the unit layer is the honest first test.
- **Tests that landed:** `redact-work-disclosure.test.ts` (per-employer denylist + `resolveDisclosureCompanies`), `enforce-post-disclosure.test.ts` (the leak, the mirror-case loosening, and the "still allows naming the attributed employer itself" control), `get-work-context.use-case.test.ts` (the read side), `agent-policy.e2e.test.ts` (the same attack through the real route).
- **Gate:** `guardrails PASS` at `faef823`, api lane uncached at 59.7s.

## Verification

**Independent REVIEW_FIX pass, 2026-08-22 (iteration 12). Verdict: approved.**
Nothing below was taken from the fix commit's message.

- **Red proved, at three layers.** At `bea6b1b`: 3 failed / 48 passed across the
  three unit files, and every failure *is* the defect — two
  `expected [Function] to throw` on `assertPostRespectsDisclosure` naming PagBank,
  and `expected '…' not to contain 'PagBank'` on `GetWorkContextUseCase`. No
  import, fixture or selector error. The 48 passes include the controls the red
  commit added on purpose. The HTTP case was proved **separately** rather than
  trusted: at `bea6b1b` only the new e2e case was pulled forward
  (`git checkout faef823 -- <e2e path>`) and run against the pre-fix source
  through the real Fastify app and the real dev Postgres → **expected 201 to be
  400**, red for the right reason.
- **Green proved.** On `nightly/qa-hardening`: the three unit files 55/55, the
  whole `agent-policy.e2e.test.ts` 27/27, and `vitest related
  resolve-connection-disclosure.ts` — the widest blast area — 204/204 across 12
  files.
- **Reviewed as a change, not just as a green test.** `buildBlockedTerms` has
  exactly three non-test callers (grep over `apps` + `packages`) and all three
  migrated together; `apps/mcp` and `apps/web` never touch it. `packages/schemas`
  is untouched and did not need to change — `DisclosureCompany` is an internal
  api type, not a boundary shape — so nothing was widened. No workaround signal
  in the added lines (no `any`, no `@ts-`, no `eslint-disable`, no `.skip`, no
  swallowed catch, no timing hack); the one `as string` in the new e2e case is
  the file's own pre-existing idiom. No scope creep: 7 files, 189 insertions, no
  renames, no reformatting. The rewritten `buildBlockedTerms` unit cases are
  faithful — a `companiesAt(level, names)` helper reproduces the old scalar
  semantics exactly, every removed line is an *input* line and every `expect` is
  byte-identical. The deep-review funnel (`build_manifest.py --base bea6b1b`)
  reports 7 changed → 7 selected, 0 ignored, 0 skipped, so no hunk escaped the read.
- **The digest path's extra strictness was traced by hand.** A digest that is
  itself at `summary` still blocks **every** name on the history, not just its
  own employer's — an intentional asymmetry with the post path, on the strict
  side, preserving `honours a connection-level override that is STRICTER than the
  account`. Every combination of role override / connection override / account
  default is either unchanged or strictly stricter than pre-fix.
- **Confirmed against the real rows.** `seed-node-backend-040` still sits at
  `agent_disclosure_level = summary` with Globo/PagBank/iFood at `NULL` and VTEX
  (`029da3d1-cf59-4c37-827b-48eb8624d758`, the exact id in the reproduction) at
  `full`. Fed verbatim through the fixed functions, the denylist comes back
  `["Globo","PagBank","iFood"]` with VTEX correctly absent, and the bug's own
  attack sentence is caught. Postgres holds no leftover repro post naming PagBank.

**Not verified.** No live curl/PAT walk through a running CraftHub api: port 3333
is serving an unrelated project this run (`/docs/json` → "Retro DOC API",
`/login` 404s) and restarting dev servers is forbidden inside the loop — the e2e
lane above is the substitute and exercises the same route through the same app
against real Postgres. The full `npm run guardrails` was not re-run by the review
(the Stop hook runs it on the same tree; the fix commit records a full PASS with
the api lane uncached). The deep-review agent fan-out was not run — its manifest
funnel was, and all 189 changed lines were read by hand instead. Nothing here was
observed in a browser: the change is server-side only, with no `apps/web` file in
the diff and therefore no four-state or dark-mode surface.
