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
- **Environment:** web **:5273** · api **:3344** (ports 5173/3333 belong to a different project on this machine) · `seed.react-frontend.003@linkhub.local` / `12345678`, with `GET /me` intercepted and returned as 500

1. Sign in as the seeded developer and open `/dashboard` with `GET http://localhost:3344/me` mocked to 500.
2. **Wait past the retries.** For the first ~7 seconds the panel shows the "Loading profile" skeleton — TanStack Query's default 3 retries keep `meQuery.isLoading` true, and a check that samples at 2.5s wrongly reports the bug handled.
3. From t+7.5s (4 attempts, all 500) the profile panel renders placeholder identity and an enabled Edit button. No error copy appears, and it never changes again.

**Expected:** an error state distinct from the empty state.
**Actual:** empty-state copy is shown for a failed request.

## Evidence

- `e2e/journeys/05-profile-appearance.spec.ts:893` — the assertion that recorded it.
- **Re-reproduced in a real browser** at run `2026-08-22T18:58:46.702Z`, iteration 36 (TRIAGE) — headless chromium, real login, real 500 via `page.route`. Transcript, screenshots and the probe script: `.nightly/evidence/BUG-20260822-dashboard-error-state/`.
- Observed panel text: `? | Your name | @username | Edit profile | No description yet. | Appearance | Banner | Not set | Background | Not set`. Four console errors, zero user-facing error copy anywhere in `<body>`.
- **Severity was re-tested, not assumed.** With `/me` still failing, the Edit dialog opens with every field blank (`username`, `name`, `description`, `location` all `""`) and an enabled Save — but the form's zod resolver rejects the empty required fields, so `PUT /profile` never fires. The write was additionally intercepted during the probe so no blank profile could reach the database. **Medium/major holds; this is not data loss.**

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — a failed `/me` renders as an empty account. *Cause* — `dashboard-page.tsx:750` branches on `meQuery.isLoading` only, and the else branch feeds `DashboardProfileDisplay` with `meQuery.data?.x ?? ""` for every field, so error and empty collapse into one render. `meQuery.isError` is never read in `apps/web/src/features/dashboard/pages/dashboard-page.tsx` (`isError` appears there only for mutations). `apps/web/src/lib/session.ts` already documents this failure mode for expired sessions; a plain 5xx is still unhandled.
- **Root Cause (taxonomy):** missing-state — error is folded into the empty path
- **Fix commit:** —
- **Regression test:** component test with `@testing-library/react` asserting error copy renders when the `/me` query errors, and that it differs from the empty state. Fails today.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
