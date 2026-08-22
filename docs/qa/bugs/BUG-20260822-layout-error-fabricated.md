# BUG-20260822-layout-error-fabricated: when /me/layout fails, the editor shows a fabricated default layout as if it were the user's own

- **Status:** open
- **Impact (user-side):** Data loss — autosave can persist a fabricated layout over the real one
- **Severity:** High · **Priority:** P1
- **Persona Affected:** Diego, the curating developer
- **Journey Step:** J-profile-appearance, opening `/dashboard/layout`
- **Theme:** both
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `BUG-20260822-layout-error-fabricated`, carried in from the QA hand-off, confirmed into run `2026-08-22T18:58:46.702Z` at iteration 4 (TRIAGE)

## Summary

On a 5xx from `GET /me/layout` the editor does not fail — it invents. The user
gets a full grid of blocks they never created, an enabled toolbar, and the
status line "Changes save automatically". Nothing anywhere says a request
failed.

That is worse than a blank screen. A user who drags anything is editing a
fabricated layout, and the autosave then writes it over their real one. This is
the four-state rule `AGENTS.md` makes mandatory, and the missing state's failure
mode here is data loss rather than confusion.

## Reproduction

- **Charter:** none yet · **Tour:** the-broken-network tour
- **Environment:** web :5173 · api :3333 · any seeded developer, with `GET /me/layout` intercepted and returned as 500

1. Open `/dashboard/layout` with `GET /me/layout` mocked to 500.
2. The page renders a complete default layout (e.g. a "Profile header block" card) with a working toolbar.
3. No error copy appears anywhere.

**Expected:** an error state that says the layout could not be loaded, and does
not offer editing.
**Actual:** `buildDefaultLayout(viewport)` is rendered as though it were saved
data.

## Evidence

- `e2e/journeys/05-profile-appearance.spec.ts:822` — the assertion that recorded it.
- **Not re-reproduced in run `2026-08-22T18:58:46.702Z`.** Carried in from the hand-off. FIX must reproduce it first.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — a fabricated layout presented as the user's own. *Cause* — `layoutQuery.isError` is never read in `apps/web/src/features/profile-layout/pages/profile-layout-page.tsx`; on failure `full` is `undefined` and the code falls through to `buildDefaultLayout(viewport)`.
- **Root Cause (taxonomy):** missing-state — error is folded into the empty/default path
- **Fix commit:** —
- **Regression test:** component test with `@testing-library/react` — render the page with the layout query in an error state, assert error copy is shown and the editor is not interactive. Fails today. `RouteErrorState` and the helpers in `apps/web/src/shared-components/route-states.tsx` are the intended primitives.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
