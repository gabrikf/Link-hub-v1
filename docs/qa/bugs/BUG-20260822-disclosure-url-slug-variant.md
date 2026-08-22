# BUG-20260822-disclosure-url-slug-variant: an employer with a space in its name still leaks, because a URL spells it `acme-corp` and the denylist only knows `Acme Corp`

- **Status:** open
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
- **Do not** loosen `buildTermPattern` itself. That was already the wrong answer once, recorded in the fix notes for `BUG-20260822-disclosure-external-url`: the matcher is right, the inputs were missing.
- **Fix commit:** —
- **Regression test:** pure business rule → unit tests beside `apps/api/src/core/use-case/agent-policy/redact-work-disclosure.test.ts`. Red case: a `summary` account with `"Acme Corp"`, assert `findDisclosureViolations("https://github.com/acme-corp-internal/x", terms)` is non-empty — fails today. Paired negative cases in the same commit, so the fix cannot buy its pass with false positives: a legitimate URL that merely contains one token (`https://github.com/acme/other`) and ordinary prose must still pass. Then an HTTP test via `build-test-app.ts` + `server.inject`: `POST /me/posts` with the slugified URL as `externalUrl` expects `400`.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
