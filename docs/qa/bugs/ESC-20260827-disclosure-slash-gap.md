# ESC-20260827-disclosure-slash-gap: a two-word employer split across a URL path segment is not treated as a disclosure

- **Status:** escalated — deliberately NOT fixed tonight, needs a product call
- **Impact (user-side):** A developer at the default `summary` disclosure level can have a two-word employer name published inside a clickable link, when the agent writes the two words as separate URL path segments (`github.com/acme/corp/pull/1`)
- **Severity:** Minor · **Priority:** P3
- **Persona Affected:** Diego, the curating developer — same harm as BUG-20260827-disclosure-underscore-slug, much narrower trigger
- **Journey Step:** J-agent-publish-post → J-public-profile-read
- **Theme:** both — server-side policy
- **Scenarios:** none
- **Found:** 2026-08-27 · **Report:** docs/qa/reports/2026-08-27-nightly.md
- **GitHub:** none — found by the autonomous nightly loop
- **Origin:** split out of `BUG-20260827-disclosure-underscore-slug` at triage iteration 105, when measuring that fix's blast radius

## Summary

`findDisclosureViolations` decides two separate things about a character: whether
it may sit **between** the words of an employer name (`SEPARATOR_SPELLINGS`,
`redact-work-disclosure.ts:103`) and whether it counts as a word character that
breaks a match sitting **beside** it (the boundary class at `:174`).

`/` is in **neither** list. So it does not join `Acme` to `Corp`, and it also does
not break anything — it is simply not considered, and the match never happens:

```
findDisclosureViolations("https://github.com/acme/corp/pull/1", ["Acme Corp"])
  -> []                                                          <-- leak

findDisclosureViolations("https://github.com/acme-corp/pull/1", ["Acme Corp"])
  -> ["Acme Corp"]                                               (correct)
findDisclosureViolations("https://github.com/acme_corp/pull/1", ["Acme Corp"])
  -> ["Acme Corp"]                                               (correct)
```

Single-word employers ("Nubank") are unaffected — there is no gap to spell.

## Reproduction

- **Environment:** `apps/api/src/core/use-case/agent-policy/redact-work-disclosure.ts`
  executed directly with `node --experimental-strip-types`
- **Evidence:** `.nightly/evidence/i105-triage/underscore-slug-reproduced-and-blast-radius.txt`, section 4

1. Call `findDisclosureViolations("https://github.com/acme/corp/pull/1", ["Acme Corp"])`.
2. Observe `[]`.
3. Control: the same URL with `acme-corp` or `acme_corp` returns `["Acme Corp"]`,
   so the denylist is loaded and the term is right.

**Expected:** either `/` is a separator spelling like `-` and `_`, or the product
states that a path split is not a disclosure and this is closed as by-design.

**Actual:** `/` is neither, which is a gap by omission rather than a decision.

## Why this is escalated and not confirmed

The sibling bug, `BUG-20260827-disclosure-underscore-slug`, is **two rules in the
same file cancelling each other** — `_` is declared a separator at `:103` and a
word character at `:174`. Repairing a self-contradiction is safe: the file already
says what the answer should be.

This one is different in kind. Adding `/` to `SEPARATOR_SPELLINGS` is a
**widening**, and it would make every two-word term match across path segments
that have nothing to do with each other:

- term `Data Science` would start hitting `site.com/data/science-fair`
- term `Open Source` would start hitting `docs.site.com/open/source-code`

Each new false positive is a **400 on a real publish**, and the deploy is
tomorrow. Trading a silent leak for a silent leak is not on the table, but
trading a narrow leak for a broad publish-blocker the night before a deploy is a
bad trade to make without evidence.

The frequency also does not justify the risk: it needs a **multi-word** employer
**and** an agent that writes the two words as separate path segments. Real
GitHub and GitLab org names use `-` or `_`, both of which are (after tonight's
fix) correctly refused.

## Recommendation

1. Do **not** fold this into tonight's fix.
2. Before changing anything, measure: pull the real `external_url` values out of
   `posts` in a production-shaped database and count how many two-word denylist
   terms a `/`-as-separator rule would newly match, and how many of those are
   genuine disclosures rather than coincidences.
3. Get a product call on false-positive tolerance for the disclosure policy. The
   underscore bug was decided by harm asymmetry (a silent public leak beats a
   recoverable 400); that argument does **not** transfer here, because the
   false-positive rate is unbounded rather than one known assertion.
4. If it does go ahead, `/` belongs in `SEPARATOR_SPELLINGS` at `:103` and must
   stay off the quantified-group path the file's own comment warns about — the
   text is agent-controlled and a nested quantifier there is a backtracking
   hazard.

## Related

- `BUG-20260827-disclosure-underscore-slug` — the sibling defect, confirmed and
  fixed tonight. Its test-plan item 3 was withdrawn in favour of this document.
- `BUG-20260822-disclosure-url-slug-variant` — the original slug-spelling fix
  that introduced `SEPARATOR_SPELLINGS`.
