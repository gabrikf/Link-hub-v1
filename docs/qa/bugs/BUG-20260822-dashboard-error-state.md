# BUG-20260822-dashboard-error-state: when /me fails, the dashboard profile panel is indistinguishable from a wiped account

- **Status:** open
- **Impact (user-side):** Alarm and wasted work — a transient 5xx looks like data loss
- **Severity:** Medium · **Priority:** P2
- **Persona Affected:** Diego, the curating developer
- **Journey Step:** J-profile-appearance, opening `/dashboard`
- **Theme:** both
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `BUG-20260822-dashboard-error-state`, carried in from the QA hand-off, confirmed into run `2026-08-22T18:58:46.702Z` at iteration 4 (TRIAGE)

## Summary

On a 5xx from `GET /me` the dashboard profile panel renders "Your name",
"@username", "No description yet." and an enabled Edit button — the empty state,
verbatim. A user whose request merely failed is shown what looks like an account
that lost everything, and the obvious reaction is to type it all back in over a
transient error.

Same shape as `BUG-20260822-layout-error-fabricated`, one screen up, without the
autosave that turns it into data loss.

## Reproduction

- **Charter:** none yet · **Tour:** the-broken-network tour
- **Environment:** web :5173 · api :3333 · any seeded developer, with `GET /me` intercepted and returned as 500

1. Open `/dashboard` with `GET /me` mocked to 500.
2. The profile panel renders placeholder identity and an enabled Edit button.
3. No error copy appears.

**Expected:** an error state distinct from the empty state.
**Actual:** empty-state copy is shown for a failed request.

## Evidence

- `e2e/journeys/05-profile-appearance.spec.ts:893` — the assertion that recorded it.
- **Not re-reproduced in run `2026-08-22T18:58:46.702Z`.** Carried in from the hand-off. FIX must reproduce it first.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — a failed `/me` renders as an empty account. *Cause* — `meQuery.isError` is never read in `apps/web/src/features/dashboard/pages/dashboard-page.tsx`. `apps/web/src/lib/session.ts` already documents this failure mode for expired sessions; a plain 5xx is still unhandled.
- **Root Cause (taxonomy):** missing-state — error is folded into the empty path
- **Fix commit:** —
- **Regression test:** component test with `@testing-library/react` asserting error copy renders when the `/me` query errors, and that it differs from the empty state. Fails today.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
