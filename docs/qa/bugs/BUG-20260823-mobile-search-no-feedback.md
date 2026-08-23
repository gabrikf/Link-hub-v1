# BUG-20260823-mobile-search-no-feedback: on a phone, running a recruiter search changes nothing the recruiter can see

- **Status:** verified
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
- **Environment:** Chromium 390×844 · nightly stack web http://localhost:5273 · api http://localhost:3344 (dev stack: 5173 / 3333) · `bash db-manage.sh seed-all`, signed in as `seed.react-frontend.003@linkhub.local`

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

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — after a successful search nothing inside a phone viewport changes. *Cause* — `apps/web/src/features/search/pages/advanced-search-page.tsx:122-135`, the `searchMutation.onSuccess` handler sets `rankedResults` / `lastSearchInput` / `searchSessionId` / `hasSearched` and never moves the viewport, moves focus, or announces a count. `SearchResults` renders far below the composer, the two semantic selects and the mandatory-filters block, which together exceed a phone viewport.
- **Root Cause (taxonomy):** *to be set at fix time*
- **Fix commit:** *pending*
- **Regression test:** *pending* — see test plan below.
- **Gate:** *pending*

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

<!-- filled at REVIEW_FIX -->
Not yet fixed.

**Not verified at triage:** only 390×844 and 1440×900 were measured — the width
at which the Results heading first crosses the fold is unknown, so the affected
range of devices is bounded below but not above. No real device and no real
touch; Playwright clicks model taps. No real screen reader — the "silence on
success" finding is read from the live regions' text content, which is the input
to the announcement, not a recording of one.
