# BUG-20260827-disclosure-underscore-slug: the employer name still leaks in a URL when the slug joins it to the next word with an underscore

- **Status:** claimed for FIX (triaged at iteration 102, re-reproduced and re-scoped at iteration 105 — see "Amendment at triage iteration 105" below, which **narrows the test plan**)
- **Impact (user-side):** A developer at the default `summary` disclosure level gets their employer's name published to the anonymous public feed, inside a clickable link, by an agent that did nothing unusual
- **Severity:** Major · **Priority:** P1
- **Persona Affected:** Diego, the curating developer (patience 0 for an unapproved disclosure going live) — and Priya reads the leak
- **Journey Step:** J-agent-publish-post → J-public-profile-read
- **Theme:** both — server-side policy, not presentation
- **Scenarios:** none
- **Found:** 2026-08-27 · **Report:** docs/qa/reports/2026-08-27-nightly.md
- **GitHub:** none — found by the autonomous nightly loop
- **Origin:** `.nightly/QUEUE.json` CAND-0125 (HUNT iteration 100, disclosure cohort), re-proved at triage by executing the policy module directly
- **Narrows:** BUG-20260822-disclosure-url-slug-variant — the same leak, the separator that fix missed

## Summary

`BUG-20260822-disclosure-url-slug-variant` taught the denylist that a URL spells
"Acme Corp" as `acme-corp`. It added `_` to the separator alternatives at
`redact-work-disclosure.ts:103`:

```js
const SEPARATOR_SPELLINGS = ["[\\s\\-_.+]*", "%20"];
```

But `_` is **also** still in the word-boundary class at `:174`:

```js
new RegExp(`(?<![\\p{L}\\p{N}_])${buildTermBody(term)}(?![\\p{L}\\p{N}_])`, "giu")
```

So the two rules cancel. `_` is a legal gap *between the words of the term*, and
simultaneously a character that makes the match fail when it sits *beside* the
term. `-` is not in the boundary class, which is precisely why the hyphen
spelling works and the underscore spelling does not.

Second, smaller gap in the same function: `/` is in neither list, so a two-word
employer split across a path segment (`github.com/acme/corp`) also passes.

The affected callers are `enforce-post-disclosure.ts:108-115` (which is what
turns this into a published post), `get-work-context.use-case.ts` and
`resolve-connection-disclosure.ts`.

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** module executed directly at triage; equivalent live walk recorded by HUNT on api `:3333`

```
findDisclosureViolations(text, ["Nubank", "Acme Corp"]):

  ["Nubank"]     https://github.com/nubank-core/ledger/pull/42     BLOCKED (correct)
  []             https://github.com/nubank_core/ledger/pull/42     PASSES   <-- leak
  ["Acme Corp"]  https://github.com/acme-corp-internal/x           BLOCKED (correct)
  []             https://github.com/acme_corp_internal/x           PASSES   <-- leak
  ["Acme Corp"]  https://example.com/acme%20corp/x                 BLOCKED (correct)
  []             https://github.com/acme/corp/x                     PASSES   <-- leak
  ["Nubank"]     Worked at Nubank.                                 BLOCKED (control)
```

Live walk recorded at HUNT (iteration 100), account `seed.python-data.042`
(`summary`, employers VTEX / Nubank / QuintoAndar): `externalUrl`
`https://github.com/nubank-core/ledger/pull/42` → **400**; the same URL with
`nubank_core` → **201**, row confirmed in psql, and returned by the **anonymous**
`GET /profile/seed-python-data-042/posts`.

**Expected:** all three spellings of the employer inside a URL are refused with
the same 400 that names the offending term.

**Actual:** only the hyphen and `%20` spellings are refused.

**Control:** the prose spelling and the hyphen spelling still block, so the
denylist is loaded and the term is right — only the underscore boundary differs.

## Evidence

- `.nightly/evidence/i102-triage/cand-0125-underscore-slug.txt` — triage's own
  direct execution, with the two conflicting source lines quoted.
- HUNT's live 400/201 pair on `:3333`, recorded in `.nightly/QUEUE.json` CAND-0125.

## Judgement at triage

- **Who is hurt, doing what:** a developer on the default level whose agent
  attaches the PR it just described. `underscore_org/repo` is ordinary GitHub
  and GitLab naming — this is not a crafted input.
- **Would they notice?** Not until someone else does. That is what makes it
  worth fixing: the harm is silent and public, and the platform's core promise
  is that this exact string does not get published.
- **Recorded debt?** No.
- **Harness problem?** No — the leak is in product code and was confirmed live
  through the real publish endpoint.
- **Blocker or major?** Major, consistent with `BUG-20260822-disclosure-url-slug-variant`,
  which was the same leak class at the same severity. It is a narrowing of an
  already-closed hole, not an open door: the prose and hyphen spellings are
  blocked, so the agent's most likely output is already refused.
- **Is the fix riskier than the symptom?** No. Dropping `_` from the two
  boundary classes is a two-character change whose failure direction is *more*
  blocking, and over-blocking gives the agent a clear 400 naming the term rather
  than a silent leak. Adding `/` to `SEPARATOR_SPELLINGS` is the same shape.
  Both must stay off the quantified-group path the file's own comment warns
  about — the text is agent-controlled and a nested quantifier there is a
  backtracking hazard.

**Scope discipline for FIX:** touch `redact-work-disclosure.ts` only. Do not
restructure `buildTermBody` or `buildGapPattern`. Do not change any error
message or the shape of anything in `@repo/schemas`.

## Test plan agreed at triage

A pure business rule, so it belongs next to the use case:
`apps/api/src/core/use-case/agent-policy/redact-work-disclosure.test.ts`.

1. **`findDisclosureViolations("https://github.com/nubank_core/ledger/pull/42", ["Nubank"])`
   returns `["Nubank"]`.** Fails today (returns `[]`).
2. **The two-word case:** `acme_corp_internal` against `["Acme Corp"]` returns
   `["Acme Corp"]`. Fails today.
3. **The path-separator case:** `github.com/acme/corp/x` against `["Acme Corp"]`
   returns `["Acme Corp"]`. Fails today.
4. **Regression guards that must stay green** — the file's existing cases:
   `acme-corp-internal` and `acme%20corp` still block; `corporate-ledger` and
   `acmecorporate` still do **not** match; `"sun"` still does not hit inside
   `"sunset"`; accented names ("Fábrica") still behave.
5. **One HTTP-layer test** through `build-test-app.ts` + `server.inject` on
   `POST /me/posts` with the underscore `externalUrl`, asserting 400 and that the
   error body names the term — this is the layer the user actually meets, and
   `enforce-post-disclosure.ts` is what has to call the repaired matcher.

---

## Amendment at triage iteration 105 — re-reproduced, and the fix's blast radius measured

Iteration 105 re-proved the leak independently rather than trusting iteration
102, and then did the thing the first triage did not: **it applied the proposed
fix and ran the suite before claiming the bug.** Two things came out of that, and
both change the instructions to FIX.

Evidence: `.nightly/evidence/i105-triage/underscore-slug-reproduced-and-blast-radius.txt`.
The source edit was reverted immediately; `git status` was clean afterwards.

### 1. The fix collides with an existing test, and that test is the bug

Dropping `_` from both lookaround classes at `:174` — the whole change — gives:

```
Test Files  1 failed | 19 passed (20)
Tests       1 failed | 376 passed (377)
```

The single failure is an existing assertion in this very file:

```js
// redact-work-disclosure.test.ts:120
it("does not match a term glued to another word by a digit or underscore", () => {
  expect(findDisclosureViolations("sun4life", ["sun"])).toEqual([]);        // still passes
  expect(findDisclosureViolations("my_sun_service", ["sun"])).toEqual([]);  // NOW FAILS
});
```

That assertion **is this bug, written down as a test**. AGENTS.md forbids editing
an existing test to make a change pass "unless the user asked for a behaviour
change that genuinely requires it" — this is exactly that case, the blast radius
is one line out of 377, and the direction is decided by harm asymmetry:

- **False negative (today):** an employer name is published to an anonymous feed.
  Silent, public, and the precise thing this module exists to prevent.
- **False positive (after the fix):** a publish returns a 400 that names the term
  and the agent rewords. Loud, private, recoverable.

So the underscore is treated as a separator, consistently with `:103`. **The digit
case is not touched** — `sun4life` must keep returning `[]`, because a digit is
part of a word token while an underscore in a URL is punctuation between them.
FIX must invert `:122` in the same commit as the source change and say why in the
test name.

### 2. `/` is split out and is NOT part of tonight's fix

**Test-plan item 3 above (`github.com/acme/corp`) is withdrawn.** It is a
different kind of defect: the underscore case is two rules in the same file
cancelling each other, while `/` is in neither list — adding it is a *widening*,
not a repair. A widening introduces new false positives across unrelated path
segments (the term "Data Science" would start hitting `site.com/data/science-fair`),
and a new false positive is a 400 on a real publish the night before a deploy.

Filed as **ESC-20260827-disclosure-slash-gap** (minor, escalated) for a product
call on false-positive tolerance, measured against a corpus of real `externalUrl`
values. Do not fold it into this fix.

### Test plan as it now stands

Layer is unchanged — a pure business rule, so
`apps/api/src/core/use-case/agent-policy/redact-work-disclosure.test.ts`.

1. `nubank_core` inside a URL against `["Nubank"]` → `["Nubank"]`. Fails today.
2. `jira.nubank_internal.com` against `["Nubank"]` → `["Nubank"]`. Fails today.
3. `acme_corp_internal` against `["Acme Corp"]` → `["Acme Corp"]`. Fails today —
   this is the *trailing* underscore, which is the one a multi-word term still
   leaks on (an underscore *between* the words is already consumed by the gap
   pattern, so `acme_corp` alone is a green control, not a red test).
4. Invert `:122`: `my_sun_service` against `["sun"]` → `["sun"]`, renamed to say
   the underscore is a separator and the digit is not.
5. Guards that must stay green: `sun4life` → `[]`; `sunset` does not match `sun`;
   `acme-corp-internal` and `acme%20corp` still block; `corporate-ledger` and
   `acmecorporate` still do not match; accented names still behave.
6. One HTTP-layer test through `build-test-app.ts` + `server.inject` on
   `POST /me/posts` with the underscore `externalUrl`, asserting 400 and that the
   body names the term.

Scope is unchanged and tight: `redact-work-disclosure.ts:174` and its test file.
No `SEPARATOR_SPELLINGS` change, no `buildTermBody`/`buildGapPattern`
restructuring, no error-message change, no `@repo/schemas` change.
