# BUG-20260823-mobile-search-no-feedback: on a phone, running a recruiter search changes nothing the recruiter can see

- **Status:** fixed (approved at review, iteration 57)
- **Impact (user-side):** Blocked-in-practice (the journey is completable, but nothing tells the user it succeeded)
- **Severity:** High · **Priority:** P2
- **Persona Affected:** Priya, the recruiter — on a phone
- **Journey Step:** J-recruiter-search, the step where the recruiter submits a job description and expects candidates
- **Theme:** both (the defect is layout/geometry, not colour — reproduced in light and confirmed present in dark by the i54 pass)
- **Scenarios:** none yet — SRCH scenario for the mobile viewport is a gap
- **Found:** 2026-08-23 · **Report:** docs/qa/reports/2026-08-23-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0114 (HUNT iteration 54, lane `responsive-dark`), confirmed in run `2026-08-22T18:58:46.702Z`, iteration 55 (TRIAGE)

## Summary

Priya opens `/dashboard/search` on a 390×844 phone, types a job description, and
taps **Search Top 50** — the single action the whole recruiter product exists
for. The button says "Processing…" for about ten seconds. Then the screen goes
back to exactly what it showed before she tapped.

The search worked. Fifty candidates are in the DOM. The **Results** heading is
1069px down a page whose viewport is 844px tall, and nothing scrolls the page or
moves focus, so not one pixel inside her viewport says so. The only difference
between the before and after screenshots is that the textarea's focus ring is
gone.

Two consequences follow, and the second one costs money. She cannot tell the
search from a failure, so she taps again — measured: three taps produce **three**
`POST /resumes/search`, each one an OpenAI embedding plus a pgvector top-50 plus
a fresh in-browser TF.js re-rank. And a screen-reader user gets the same silence
in a different form: the `aria-live="polite"` region announces "Searching
candidates" while the request is in flight and then says **nothing at all** when
the fifty results land.

At 1440×900 the same run puts the loading skeleton at top=874 and Results at
top=803 — both inside the fold. **This is invisible to anyone developing on a
desktop**, which is why it survived to iteration 54.

## Reproduction

- **Charter:** none yet · **Tour:** the-mobile tour
- **Environment:** Chromium 390×844 · nightly stack web http://localhost:5273 · api http://localhost:3344 (dev stack: 5173 / 3333) · `bash db-manage.sh seed-all`, signed in as `seed.react-frontend.003@crafthub.local`

1. Sign in as a seeded developer and open `/dashboard/search` in a 390×844 viewport.
2. Type `Senior React frontend engineer with TypeScript` into "Who are you looking for?".
3. Tap **Search Top 50**.
4. Watch only the viewport. Do not scroll.

**Expected:** something inside the viewport acknowledges the result — the results
region is brought into view (or given focus), and/or the live region announces
the count, e.g. "50 candidates found".
**Actual:** the button returns to "Search Top 50", `scrollY` stays `0`, the
Results heading sits at `top=1069`, and the live region is empty.

## Evidence

- **Reproduced from scratch at triage (iteration 55)**, not taken from the queue on trust. Probe: `.nightly/probes/i55-triage-repro.mjs` (section A). Screenshots: `.nightly/evidence/i55-triage/A-390-before.png`, `A-390-after.png` — read side by side, the only visible difference is the textarea focus ring.
- Measured at 390×844 after success: `scrollY=0`, `vh=844`, `docHeight=58119`, headings `[{top:118,"Advanced Search (AI)"},{top:1069,"Results"},…]`, `resultCards=50`, `activeElement=BODY`, `POST /resumes/search` × 1.
- **Live-region behaviour, which the original candidate did not capture:** sampling every 500ms across the whole request, the only non-empty announcement ever seen is `polite:Searching candidates`. Nothing is announced on success. Two `aria-live="polite"` regions exist and both are empty before and after.
- Re-tap cost, measured at i54 with `.nightly/probes/i54-search-retap.mjs`: 3 taps → 3 × `POST /resumes/search`, `scrollY` 0 throughout.
- Desktop contrast, from i54 `.nightly/evidence/CAND-0114/1440-*.png`: skeleton `top=874`, Results `top=803`, both above the fold.
- **Corrected from the original candidate:** i54's first pass reported "no in-viewport loading feedback at all". That half is **wrong** — the submit button relabels itself to "Processing…" and there is a live region saying "Searching candidates". Only the post-success half is real, and this entry claims only that.

## Fix

- **Root cause:** *symptom* — after a successful search nothing inside a phone viewport changes. *Cause, and it was two independent silences, not one:* (a) `apps/web/src/features/search/pages/advanced-search-page.tsx:122-135`, the `searchMutation.onSuccess` handler sets `rankedResults` / `lastSearchInput` / `searchSessionId` / `hasSearched` and never moves the viewport or focus, while `SearchResults` renders below the composer, the two semantic selects and the mandatory-filters block, which together exceed a phone viewport; (b) `apps/web/src/features/search/components/search-results.tsx` had a live region for the **loading** state only (`LoadingLabel`, which unmounts on success) and none for the outcome — so a screen-reader user on **every** viewport, desktop included, heard the search start and never heard it finish. Fixing (a) alone would have left (b) in place.
- **Root Cause (taxonomy):** missing feedback on an asynchronous state transition — the state changed, nothing that a user perceives changed with it.
- **Fix commit:** `2205295` (red at `68d3b83`). Two additive changes: a permanently-mounted `sr-only` `aria-live="polite"` region in `SearchResults` that is empty while a search is in flight and speaks only about an outcome ("50 candidates found." / "No candidates found."), and an effect in `AdvancedSearchPage` keyed on `searchSessionId` that focuses a named, `tabIndex={-1}` results region and scrolls it into view. `scroll-mt-20` clears the sticky top bar, which otherwise covers the very heading the recruiter is sent to.
- **Regression test:** `apps/web/src/features/search/pages/advanced-search-page.test.tsx` — 3 tests: the count is announced, the empty outcome is announced, and focus lands on the results region. Each first waits for the result header so a missing announcement can never be confused with a search that never ran.
- **Gate:** `guardrails PASS` at fix time; all 45 tests under `apps/web/src/features/search` pass at review.

### Test plan agreed at triage

Two layers, both of which fail today:

1. `@testing-library/react` beside `advanced-search-page.tsx`: after a mocked
   successful search, assert the success announcement exists — a live region
   whose text names the result count. This is layer-honest (the component owns
   the announcement) and does not depend on layout.
2. The geometry half cannot be proved in jsdom, which has no layout. It belongs
   in a **visual scenario** for `/dashboard/search` at 390 in both themes,
   covering loading and filled, asserting the Results region is inside the
   viewport (or holds focus) after success — per the four-state rule in
   `AGENTS.md`.

Do **not** try to assert `scrollIntoView` geometry in jsdom; a test that mocks
`scrollIntoView` and asserts it was called proves the call, not the outcome, and
is the weaker of the two. Write it only as a cheap companion to (2), never
instead of it.

## Verification

**Reviewed and approved at iteration 57 (REVIEW_FIX), independently of the agent
that wrote the fix.**

- **Red proved, then green proved — mechanically, not from the commit message.**
  The current test file was run against the *fix commit's* sources (3 passed),
  then against the **red commit's** sources with the test left as it is today
  (`git checkout 68d3b83 -- search-results.tsx advanced-search-page.tsx`): **3
  failed**, each for the bug's own reason — `Unable to find an element with the
  text: /3 candidates found/i`, `…/no candidates found/i … selector
  '[aria-live]'`, and `Unable to find role="region" and name /results/i`. No
  import error, no bad selector, no missing fixture. Sources restored afterwards.
- **The fix commit edits one line of its own red test** (`/no candidates
  matched/` → `/no candidates found/`). Checked rather than waved through: the
  edit changes the *expected wording* of the announcement, not the strength of
  the assertion — the test still requires a live region that names the outcome —
  and the commit body argues the case (announcing the empty state's own sentence
  duplicates the paragraph focus lands the reader on a moment later). No
  pre-existing test was touched.
- **Re-walked in a real browser with a probe written at review**
  (`.nightly/probes/i57-review-verify.mjs`, evidence `.nightly/evidence/i57-review/`),
  which asks three questions the fix's own probe did not. In **390×844 light**,
  **390×844 dark** and **1440×900**, all identical: the Results heading lands at
  `top=105` against a sticky bar whose bottom edge is `61` — so it is genuinely
  *visible*, not merely at a small offset — the region is `document.activeElement`,
  the live regions read `polite:Searching candidates` then `polite:50 candidates
  found.`, the before/after viewport bitmaps are **CHANGED** (they were
  `IDENTICAL` at triage), 50 cards, zero console errors, zero page errors.
- **A second search returning the same people still moves the viewport.** Scrolled
  back to `0`, re-ran the same job description: `scrollY` returns to `964` and the
  region takes focus again. That is the case the re-tap storm lives in, and it
  works because the effect is keyed on the search session id rather than on the
  results array.
- **Desktop was checked, not assumed.** At 1440×900 the fix scrolls `698` and
  focuses the results — it takes the recruiter to what they asked for rather than
  yanking them somewhere unexpected, and the announcement they never had on any
  viewport now exists.
- **Blast radius is one component.** `SearchResults` has exactly one non-test
  caller (`advanced-search-page.tsx:402`). All 45 tests under
  `apps/web/src/features/search` pass, including the four in
  `search-results.test.tsx` / `search-results-feedback.test.tsx` that use
  `getByRole("status")` as a *unique* locator — which is why the new region is a
  bare `aria-live` and not a third `role="status"`.
- **Design conformance:** `SURFACE` and `FOCUS_RING` come from
  `shared-components/surface.ts`, no hand-written card classes, no hardcoded
  colour, nothing that needs a `dark:` counterpart (the new markup is `sr-only`
  plus a scroll margin), and both themes were captured. No schema crossed a
  boundary, so there is no contract to drift.

**Residual, accepted rather than hidden:** if a search *fails* after an earlier
one succeeded, the polite region blanks and then re-emits the previous
`"50 candidates found."` while the assertive `role="alert"` announces the
failure. The count is not false — those 50 results are still the ones on screen —
and the assertive alert states the failure first, so this is stale rather than
misleading. Worth tightening the day the error path gets its own outcome text;
not worth blocking a fix that removes total silence.

**Not verified at review:** no real device, no real touch, and **no real screen
reader** — every "announced" here is read from live-region text content, which is
the input to an announcement, not a recording of one. The empty-outcome
announcement is proved only at the component layer; no real query was driven to
zero results in a browser. The re-tap storm was not re-measured against a human:
that feedback stops the third tap remains a reasonable inference. And no
committed visual scenario was added — `/dashboard/search` needs a session and a
paid embedding per run, so the geometry proof stays a nightly probe. That gap is
recorded under **Scenarios** above and is still open.

**Not verified at triage:** only 390×844 and 1440×900 were measured — the width
at which the Results heading first crosses the fold is unknown, so the affected
range of devices is bounded below but not above. No real device and no real
touch; Playwright clicks model taps. No real screen reader — the "silence on
success" finding is read from the live regions' text content, which is the input
to the announcement, not a recording of one.
