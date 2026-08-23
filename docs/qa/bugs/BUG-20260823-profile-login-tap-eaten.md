# BUG-20260823-profile-login-tap-eaten: on a phone the theme toggle sits over the top of the public profile's Login link and eats the tap

- **Status:** verified
- **Impact (user-side):** Friction (wrong action fires; recoverable in one more tap)
- **Severity:** Low · **Priority:** P3
- **Persona Affected:** Sam, the reader who arrives cold — on a phone
- **Journey Step:** J-public-profile, the step where a visitor decides to sign in
- **Theme:** both (geometry, not colour — the tap is eaten in light and in dark alike)
- **Scenarios:** none yet — PROF has no 390px scenario
- **Found:** 2026-08-23 · **Report:** docs/qa/reports/2026-08-23-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0115 (HUNT iteration 54, lane `responsive-dark`), confirmed in run `2026-08-22T18:58:46.702Z`, iteration 55 (TRIAGE)

## Summary

Sam reads a developer's public profile on a phone and decides to sign up. The
only sign-in call to action on the page is the **Login** pill in the top-right
corner. He taps the top of it — and the colour theme flips instead. The page
does not navigate.

The floating theme toggle is `position: fixed; right-4; top-3; z-40` and occupies
y 12–48. The Login pill occupies y 40–78, so the toggle covers the top **8px of a
38px target — 21% of it**. `App.tsx` already knows this hazard exists: the signed-in
`TopBarNav` reserves `pr-28` for exactly this toggle, and there is a comment
explaining why. The public profile's own Login link, which renders only when
signed out and therefore never appears next to `TopBarNav`, reserves nothing.

Low severity because it costs one extra tap and the theme flip is obvious and
undoable — but it is 21% of the conversion control on the product's most
mobile-heavy page, and the fix is a padding reservation the codebase has already
made once.

## Reproduction

- **Charter:** none yet · **Tour:** the-mobile tour
- **Environment:** Chromium 390×844, **signed out** · nightly stack web http://localhost:5273 (dev stack 5173) · any seeded profile (`bash db-manage.sh seed-all`)

1. Open `/profile/seed-react-frontend-003` in a 390×844 viewport with no session.
2. Tap 1–7px below the top edge of the **Login** pill.

**Expected:** the whole Login pill receives the tap and the app navigates to `/`.
**Actual:** the theme flips to dark; the URL does not change.

## Evidence

- **Reproduced from scratch at triage (iteration 55)** with a **real Playwright click**, not only `elementFromPoint` — `elementFromPoint` is a model of a tap, and triage wanted the tap. Probe: `.nightly/probes/i55-triage-repro.mjs` (section B). Screenshot after the tap: `.nightly/evidence/i55-triage/B-390-after-tap.png`.
- Geometry at 390×844: Login `{top:40, bottom:78, left:287, right:374}`; theme toggle `{top:12, bottom:48, left:294, right:374}`; overlap 80px wide × **8px** tall.
- Hit testing at the Login pill's centre-x: `+1 / +3 / +5 / +7` → `BUTTON[Switch to dark theme]`; `+9 / +12 / +19` → `A[Login]`.
- Real click at `(centreX, login.top + 4)`: theme `"" | none` → `"dark" | dark` — **flipped** — and `page.url()` unchanged. Both halves of the harm proved in one action.
- No overlap at 1440×900 (i54 measured zero overlapping control pairs on this route).

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — the top 8px of the Login pill is dead to taps. *Cause* — `apps/web/src/App.tsx:43-47` renders the theme toggle `fixed right-4 top-3 z-40` over every route, while `apps/web/src/features/profile/pages/public-profile-page.tsx:226-232` places the signed-out Login link `self-end` in normal flow with no gutter reserved for it. `apps/web/src/shared-components/top-bar-nav.tsx:147` solves the same collision with `pr-28`, but `TopBarNav` returns `null` when there is no session, so the public profile never inherits that reservation.
- **Root Cause (taxonomy):** *to be set at fix time*
- **Fix commit:** *pending*
- **Regression test:** *pending* — see test plan below.
- **Gate:** *pending*

### Test plan agreed at triage

jsdom has no layout, so a `@testing-library/react` test cannot see this. It
belongs in a **visual scenario** for `/profile/$username` at 390px, signed out,
in both themes, asserting that `document.elementFromPoint` over the Login link
resolves to the Login link across its full height — the assertion this probe
already makes, promoted out of `.nightly/` into `scripts/visual/scenarios/`.

Prefer reserving space (a top gutter on the signed-out Login row, mirroring
`TopBarNav`'s `pr-28`) over nudging the toggle. Moving the toggle changes it on
**every** route and would need all eight routes re-walked; changing the Login row
touches one signed-out element on one page.

## Verification

<!-- filled at REVIEW_FIX -->
Not yet fixed.

**Not verified at triage:** only 390×844 measured — the width at which the
overlap disappears is unknown, so the affected device range is bounded below but
not above. Signed-out state only (signed in, `TopBarNav` renders and this Link
does not). No real device and no real touch; a Playwright mouse click at a point
is the model used. The same collision was not re-checked against the other seven
routes at 390 — i54 reported zero overlapping control pairs elsewhere, and that
measurement was not repeated here.
