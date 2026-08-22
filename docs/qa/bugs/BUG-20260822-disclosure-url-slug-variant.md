# BUG-20260822-disclosure-url-slug-variant: an employer with a space in its name still leaks, because a URL spells it `acme-corp` and the denylist only knows `Acme Corp`

- **Status:** verified (red `f280f0f`, fixed `aeac1ef`, review approved 2026-08-22 by the nightly REVIEW_FIX pass, iteration 18)
- **Impact (user-side):** Trust-Damage
- **Severity:** High · **Priority:** P1
- **Persona Affected:** Diego, the curating developer (whose disclosure policy is being bypassed) and Atlas, the coding agent (which trips it without meaning to); Priya and Sam are who end up reading it
- **Journey Step:** J-agent-posts, the step where the agent publishes a post with a link to the work
- **Theme:** n/a (policy enforcement, not visual)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `CAND-0116`, filed by iteration 5 while fixing [BUG-20260822-disclosure-external-url](BUG-20260822-disclosure-external-url.md); confirmed in run `2026-08-22T18:58:46.702Z`, iteration 7 (TRIAGE)

## Summary

`BUG-20260822-disclosure-external-url` closed the hole where an agent could put
the employer's name in a post's link instead of its body. That fix holds — for
employers whose name is a single word. It does not hold for an employer whose
name has a space in it, because a URL cannot contain the space: the org shows up
as `acme-corp` or `acmecorp`, and the denylist is matched literally, so
`"Acme Corp"` never appears.

The developer set their policy to `summary` precisely so their agent would never
name the client. The agent then publishes `https://github.com/acme-corp-internal/…`
as the post's clickable link, on the public profile, with no human in the loop.
Anyone who reads the URL knows who the client is — and a URL is *more* legible
than prose, because it is rendered as a link and copied into search bars.

**This is a residual evasion path of a control that now works for the canonical
spelling, not a regression of that fix.** Single-token names (PagBank, Nubank,
VTEX, Globo, iFood) are caught in URLs today; the word-boundary matcher treats
`-` as a boundary, so `pagbank-internal` matches `PagBank` correctly.

## How much of the population this touches

Measured on the dev database rather than guessed
(`.nightly/evidence/BUG-20260822-disclosure-url-slug-variant/i7-population-measurement.txt`):

- **169 of 1202 roles (14.1%)** have a multi-word employer name.
- **133 distinct users** have at least one multi-word employer whose effective
  disclosure level is `summary` — i.e. an employer the policy is actively
  supposed to be hiding, spelled in a way the denylist cannot see in a URL.
- Real examples in the seed data: `Mercado Livre`, `Wildlife Studios`,
  `ACT DIGITAL/HOSPITAL ALBERT EINSTEIN`, `Banco do Brasil`.

## Reproduction

- **Charter:** none yet · **Tour:** the-disclosure tour
- **Environment:** unit level, dependency-free — the primitives in `redact-work-disclosure.ts` are pure by design · api `http://localhost:3344` for the end-to-end walk

> **Re-reproduced at branch tip on 2026-08-22 by the nightly loop, iteration 16
> (TRIAGE), before the fix was claimed.** The signature below is the *old* one —
> `buildBlockedTerms` now takes `{ companies, userBlockedTerms }` after the
> `BUG-20260822-disclosure-cross-role` fix. Re-run with the current signature via
> `cd apps/api && npx tsx ../../.nightly/evidence/BUG-20260822-disclosure-url-slug-variant/i16-probe.mts`:
> both controls still block, and **six** attack spellings still pass
> (`acme-corp`, `Acme%20Corp`, `acmecorp`, `acme_corp`, `vale-s-a`,
> `banco-do-brasil`). Also confirmed at tip that the write path genuinely scans
> the link — `enforce-post-disclosure.ts:108-115` joins `externalUrl`,
> `coverImageUrl` and `images` into the haystack — so the term spelling is the
> only thing standing between the agent and the leak.

1. Build the denylist for a `summary` account whose employers include `"Acme Corp"`:
   `buildBlockedTerms({ level: "summary", companyNames: ["Acme Corp", "PagBank"], userBlockedTerms: [] })`
2. `findDisclosureViolations("https://github.com/pagbank-internal/ledger/pull/42", terms)` → `["PagBank"]` — **blocked, correct.**
3. `findDisclosureViolations("https://github.com/acme-corp-internal/ledger/pull/42", terms)` → `[]` — **not blocked.**
4. Same for `https://acmecorp.com/blog/ledger`, `https://example.com/Acme%20Corp/report` and `https://git.example.com/banco-do-brasil/repo` — all `[]`.
5. End to end: mint a PAT with `posts:write` for a `summary` account with a
   multi-word employer, `POST /me/posts` with a clean body and that URL as
   `externalUrl` → `201`, published, readable anonymously at
   `GET /profile/:username/posts`.

**Expected:** an employer the policy hides is hidden in every spelling a URL can
produce.
**Actual:** only the exact settings spelling is matched.

## Evidence

- `.nightly/evidence/BUG-20260822-disclosure-url-slug-variant/i7-probe.mts` and `i7-probe-output.txt` — the eight-case matrix, showing the single-token control passing and the multi-word cases failing.
- `.nightly/evidence/BUG-20260822-disclosure-url-slug-variant/i7-population-measurement.txt` — the psql measurement above.
- `i16-probe.mts` / `i16-probe-output.txt` — the same matrix re-run at branch tip against the current `{ companies, userBlockedTerms }` signature: two controls block, six attack spellings pass.
- `i16-fixrisk.mts` / `i16-fixrisk-output.txt` — the candidate fix run against 11 must-block and 11 must-not-block cases, so the false-positive direction was measured *before* the bug was claimed.
- `i16-population-recheck.txt` — 169 of 1202 roles still multi-word; the population claim above has not drifted.
- **Disclosure-evidence gap, stated honestly:** this was confirmed at the unit layer plus a population measurement, **not** by publishing a live post and screenshotting a logged-out profile. Steps 1–4 are deterministic and dependency-free; step 5 is the same publish path already walked live for `BUG-20260822-disclosure-external-url` in iterations 5 and 6. The template's four-item disclosure evidence set is therefore **incomplete** for this bug: no settings screenshot and no rendered logged-out post. Whoever fixes it should close that gap while verifying.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — a multi-word employer name is not blocked once a URL slugifies it. *Cause* — `buildBlockedTerms` (`apps/api/src/core/use-case/agent-policy/redact-work-disclosure.ts`) emits each company name in exactly the spelling the user typed, and `buildTermPattern` matches it literally between unicode word boundaries. Nothing generates the separator variants a URL forces (`acme-corp`, `acme_corp`, `acmecorp`, `acme.corp`, `Acme%20Corp`).
- **Root Cause (taxonomy):** disclosure-policy
- **Direction for the fix (decided at triage):** generate variants **per blocked term**, at denylist-build time, and keep them in the same list so `findDisclosureViolations` and `redactText` both inherit them with no change. This is the one place in this file where a wider match is the right answer — but it is also the one place where a false positive **rejects a legitimate post with a 400**, so it needs its own tests in both directions:
  - Variants worth generating: the term with each internal whitespace run replaced by `-`, `_`, `.`, `%20` and the empty string.
  - `MIN_TERM_LENGTH` must still apply **after** variant generation.
  - Guard the collapsed-no-separator variant against short names: `"On It"` → `onit` is a plausible substring of ordinary text, and unlike the spaced original it can no longer rely on the space to disambiguate.
  - Keep `redactText` in mind: a variant that matches inside a URL will replace it with `[employer]` on the read path, which is correct but changes what `GET /me/work-context` returns. Assert it.
- **Do not** loosen `buildTermPattern`'s *word boundaries*. That was already the wrong answer once, recorded in the fix notes for `BUG-20260822-disclosure-external-url`: the boundary semantics are right, the inputs were missing.
- **Risk-probed at triage, iteration 16** (`i16-fixrisk.mts` / `i16-fixrisk-output.txt`). The prototype splits a multi-word term on whitespace and joins the escaped tokens with `(?:[\s\-_.+]*|%20)` inside the existing unicode boundary lookarounds. Against 11 must-block cases — including the *real* seeded employers `Mercado Livre` → `mercadolivre.com.br` and `Wildlife Studios` → `/wildlife-studios/` — and 11 must-not-block cases drawn from the existing test corpus, everything lands correctly. The one `FAIL` line in the output is a probe artefact: the term `"a"` is below `MIN_TERM_LENGTH`, which the real code filters out before it ever builds a pattern. **Single-token terms come out byte-identical**, so today's behaviour for `PagBank`/`Nubank`/`VTEX` is untouched.
- **The two implementation shapes are not equivalent — pick deliberately.**
  - *Variants as extra denylist entries* (the direction recorded at iteration 7) means `findDisclosureViolations` will return `"acme-corp"` as the violated term. That **regresses the error message**, which the function's own doc comment promises is the canonical settings spelling, so the agent is told which rule it tripped. Doing it this way needs a variant → canonical mapping.
  - *Variants inside the pattern for a multi-word term* keeps the denylist and every returned hit in canonical spelling for free, and both `findDisclosureViolations` and `redactText` inherit it. This is what the probe prototyped.
- **Do not** wrap the separator group in a second quantifier. One `*` over a character class stays linear; `(?:[\s\-_.+]*)+` is a backtracking hazard on a URL the agent fully controls.
- **Fix commit:** `aeac1ef` (red `f280f0f`). The second shape was chosen: the variants live *inside the pattern* for a multi-word term, so the denylist and every returned hit stay in the canonical settings spelling. `buildTermBody` splits the term on `[^\p{L}\p{N}]+` **keeping the gaps**, and rebuilds it as `word (?:<the gap the user typed>|[\s\-_.+]*|%20) word …` inside the untouched boundary lookarounds. A term with fewer than two words falls back to the escaped literal, so single-word terms compile byte-identical.
- **Regression test:** pure business rule → unit tests beside `apps/api/src/core/use-case/agent-policy/redact-work-disclosure.test.ts`. Red case: a `summary` account with `"Acme Corp"`, assert `findDisclosureViolations("https://github.com/acme-corp-internal/x", terms)` is non-empty — fails today. Paired negative cases in the same commit, so the fix cannot buy its pass with false positives: a legitimate URL that merely contains one token (`https://github.com/acme/other`) and ordinary prose must still pass. Then an HTTP test via `build-test-app.ts` + `server.inject`: `POST /me/posts` with the slugified URL as `externalUrl` expects `400`.
- **Gate:** `guardrails PASS` recorded at `aeac1ef` (schemas built, affected type-check, changed-file lint, api 103 test files, other workspaces, i18n parity skipped — no locale dir yet).

## Verification

**Independent REVIEW_FIX pass, 2026-08-22 (iteration 18). Verdict: approved.**
Nothing below was copied from the fix commit's message; every number was
re-measured on this tree.

- **Red proved at the red commit.** Checked out `f280f0f` and ran only this
  bug's two test files: **9 failed / 60 passed**. Every failure *is* the
  symptom — seven `expected [] to deeply equal [ 'Acme Corp' | 'Banco do
  Brasil' | 'Vale S.A.' | 'Wildlife Studios' ]`, one `redactText` leaving
  `github.com/acme-corp-internal` intact, and one `expected 201 to be 400` on
  `POST /me/posts`. No import error, no missing fixture, nothing that would fail
  for an unrelated reason. Green at `aeac1ef`: `npx vitest run
  src/core/use-case/agent-policy/ src/infra/http/controllers/agent-policy/` →
  **7 files, 111 tests, all passing**.
- **The reproduction itself was re-walked.** `.nightly/evidence/…/i16-probe.mts`
  at branch tip: both controls still block, and **all six attack spellings now
  block** (`acme-corp-internal`, `Acme%20Corp`, `acmecorp.com`, `acme_corp`,
  `vale-s-a.example.com`, `banco-do-brasil`), while the two paired negatives
  (`An acme of engineering`, `corporate-ledger`) still pass.
- **No test was edited to buy the pass.** Both commits are additive only —
  `f280f0f` is 104+/0− and 44+/0−, `aeac1ef` is 13+/0− in the test file. The
  `CI&T` case added in the fix commit guards the fix's own first draft, not the
  bug, and the commit body says so.
- **The real-data risk probe was re-run, not trusted.** `i17-realdata-risk.mts`
  diffs the old matcher against the new one over the seeded corpus: **301 users
  with a non-empty denylist, 1209 real role descriptions and post fields, 1
  behaviour change** — and it is a true positive (`PETS JARAGUA` leaking as
  `www.petsjaragua.com.br`). **Zero terms stopped matching.** The probe's own
  construction was read and is honest: it rebuilds the pre-fix regex inline and
  compares hit sets per text.
- **No false negatives, checked by hand in the directions the probe could not
  reach.** A term whose punctuation sits at its *edges* loses that punctuation
  from the pattern (`.NET Foundation` → `NET…Foundation`, `Vale S.A.` → the
  trailing dot is dropped), but the boundary lookarounds are non-consuming and
  don't require it, so every one of those still matches its canonical spelling —
  verified for `.NET Foundation`, `Vale S.A.`, `Foo (Bar)`, an all-punctuation
  term (`&&`, falls back to the literal), `Nubank`, and the accented
  `Grupo Boticário`.
- **Not a backtracking hazard**, as triage warned it must not be. `findDisclosureViolations`
  over 200k–250k-char adversarial inputs (`Acme` + 200k separators, alternating
  `-_. +` runs, a three-word term with two 100k runs, 50k start positions) all
  return in **≤ 1.0 ms**. The separator group is one `*` over a character class
  plus a flat `%20` alternative, with literals between every gap — no nested
  quantifier.
- **Blast radius walked.** The four non-test callers of these primitives
  (`enforce-post-disclosure`, `get-work-context.use-case`,
  `resolve-connection-disclosure`, `generate-activity-digest` /
  `render-activity-digest`) all inherit the same widening, and all inherit it in
  the *strict* direction — more redaction on the read side, more rejection on the
  write side. `packages/schemas` is untouched: no boundary shape changed and
  nothing was widened to let a bad payload through. No `any`, no type assertion,
  no `eslint-disable`, no `.skip`, no swallowed error in the added lines. No
  scope creep — 2 files, one function, no renames, no reformatting. Nothing
  visual changed, so there is no four-state or dark-mode surface.
- **Known residual, accepted with eyes open — the one thing this fix did *not*
  do.** Triage asked for a guard on the collapsed-no-separator variant for short
  names (`"On It"` → `onit`), and the fix does not have one: the gap is
  `[\s\-_.+]*`, so an *empty* gap is always allowed. That is load-bearing —
  `acmecorp.com` is one of the bug's own attack spellings and cannot be caught
  without it — but it means a term whose glued form is short over-matches. Demonstrated:
  with `CI&T` on the denylist, `"The cit parser is fast."` and
  `https://example.com/cit/docs` are now rejected; a hypothetical `C&A` would
  reject `"San Francisco, CA"`. Measured rather than argued: `CI&T` is the only
  seeded denylist term whose glued form is under five characters (108 role rows;
  the other punctuated name is 32 chars), no seeded user has typed a custom
  blocked term at all, and across all 1209 real texts it produced **zero** false
  positives. The failure mode is also the safe one — a 400 that names the term,
  which the agent can rewrite around, versus a silent leak in an `<a href>` on a
  public profile. **Follow-up, not a blocker:** if a denylist term whose glued
  form is ≤ 4 characters ever draws a real complaint, gate the empty-gap
  alternative on a minimum glued length instead of removing the tolerance.

**Not verified.** No live walk through a running LinkHub api: port 3333 is
serving an unrelated project this run (`/health` → `{"status":"ok"}` but
`/me/posts` → 404 with no LinkHub route table) and restarting dev servers is
forbidden inside the loop — the `server.inject` e2e case is the substitute and
exercises the real route with a real PAT through the real app. The disclosure
evidence gap recorded at triage is therefore **still open**: no settings
screenshot and no rendered logged-out public profile showing the slug absent.
The full `npm run guardrails` was not re-run by this review beyond the two
targeted vitest runs plus the Stop hook on this same tree. No rows were written
to `linkhub_dev` — reads only.
