# BUG-20260822-dashboard-error-state: when /me fails, the dashboard profile panel is indistinguishable from a wiped account

- **Status:** fixed-pending-review
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
- **Environment:** web **:5273** · api **:3344** (ports 5173/3333 belong to a different project on this machine) · `seed.react-frontend.003@crafthub.local` / `12345678`, with `GET /me` intercepted and returned as 500

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
- **Fix:** the panel grew a third branch — `meQuery.isError && !meQuery.data` renders the new `apps/web/src/features/dashboard/components/dashboard-profile-display-error.tsx`: a `role="alert"` "Couldn't load your profile", copy stating nothing was lost, and a "Try again" button wired to `meQuery.refetch()`. The condition deliberately keeps stale data over the error panel, so a failed *background* refetch does not blank a panel that already has content.
- **Fix commit:** `91963b9`
- **Regression test:** `apps/web/src/features/dashboard/pages/dashboard-page.test.tsx` — renders `DashboardPage` with a real `QueryClient` (`retry: false`) and a rejecting `fetchMyProfile`, asserts the alert is present and the empty-state copy is not. Red commit `a6443e8` (`→ Unable to find role="alert"`); it fails for the bug's own symptom — with the same rejecting query a temporary `findByText("No description yet.")` passes. A second test (a resolving `/me` still renders the saved profile) guards the filled state.
- **Gate:** `guardrails PASS` — 5/5 turbo tasks, apps/web 51 test files / 449 tests, i18n-parity skipped (no locales dir).

## Verification

- **Browser-verified after the fix, both themes**, on web :5273 / api :3344 with `GET /me` forced to 500 and polled to t+20s (past all 4 retries): `.nightly/evidence/BUG-20260822-dashboard-error-state/i37-probe-me-500-fixed.mjs`, transcript `i37-fix-verification.txt`, screenshots `i37-me-500-fixed-light.png` / `i37-me-500-fixed-dark.png`.
- Panel now reads `Couldn't load your profile | Nothing was lost — we just couldn't reach the server. … | Try again`. `role="alert"` count 1, `Edit profile` button count 0, `No description yet.` and `Your name` absent — in light **and** dark.
- **Retry works:** with `/me` allowed through again, one click of "Try again" brought back the real seeded profile in a single request (`i37-me-500-fixed-after-retry.png`).
- **Not verified:** mobile viewport (1440×900 only), no screen-reader run, retry path exercised in light theme only.

## Review — APPROVED (iteration 38)

**Red → green proved mechanically, not from the commit message.** At `a6443e8`,
`npx vitest related src/features/dashboard/pages/dashboard-page.test.tsx --run`
gives 1 failed / 1 passed, failing at `dashboard-page.test.tsx:80` with
`Unable to find role="alert"` — and the DOM dump printed alongside it shows the
whole `DashboardPage` rendered (react-select, dnd-kit, the link form), so it is
the assertion failing and not an import, a bad mock or a missing fixture. At
`48e52d3` the same command gives 2 passed. The full gate was re-run
independently: `guardrails PASS`, 51 web test files / 449 tests.

**The fix is the missing branch, not a mask.** `meQuery.isError` was read
nowhere on the page; it is now. `isError && !meQuery.data` is the right
condition — bare `isError` would blank a panel holding real content the moment a
background refetch 5xx'd. No type assertion, no `eslint-disable`, no `.skip`, no
swallowed error, no timing hack. No schema moved, so nothing was widened. No
test was edited: the red commit only adds a file, the fix commit touches none.
Blast radius is one panel — `DashboardProfileDisplayError` is imported only by
`dashboard-page.tsx`, and the Edit dialog stays mounted on the error path but
unreachable, its only trigger living in the branch that is now replaced. The
appearance copy this bug reported (`Banner`, `Not set`) lives inside
`DashboardProfileDisplay`, so it goes with the rest of the panel. Design
conforms: every red utility has a `dark:` counterpart and matches
`FeedbackMessage` / `RouteErrorState`, `react-icons/fi` only, the repo `Button`
with `fullWidth={false}` / `isLoading`, no `SURFACE` fork. Four states now
complete for this panel: loading, error, empty, filled.

**Re-walked independently in the browser** with the reviewer's own probes, not
by re-running the FIX agent's: `i38-review-probe.mjs` (transcript
`i38-review-verification.txt`) over **light desktop, dark desktop and light
mobile 390×844** — the viewport the fix had left unverified. All three: alert
count 1, `No description yet.` / `Your name` / `@username` / `Banner` /
`Not set` all absent, `Edit profile` count 0, `Try again` visible.
`i38-review-retry-probe.mjs` re-proves the retry in **dark**: one click, exactly
one request, the real seeded profile back, and **no skeleton flash** across 8
samples over 4s.

**Watch out — the retry backoff is slower and more variable than "~t+7.5s".** A
fixed 12s wait caught two of three runs still on attempt 2/3, showing the
skeleton and looking exactly like a regression. Poll until `meCalls >= 4` **and**
the panel stops saying `Loading profile`.

**Still not verified after review:** no screen reader (the `role="alert"` is
asserted by construction and by locator count, but nobody listened to it); no
dark mobile capture; no psql, since this is a read path and nothing was written.
The `deep-review` skill's full artifact pipeline was not run — it is a
multi-agent round sized for hundreds of files, and this diff is 2 files / 69
lines; its rubric was applied by hand against `AGENTS.md`, `DESIGN.md` and the
six CraftHub priorities, and its linter lanes were covered by the full gate.

**Advisory, out of scope:** the `meQuery.data?.x ?? ""` shape that caused this
bug still feeds the Edit dialog's `initialValues` (`dashboard-page.tsx:333-343`)
and the resume-import panel (`:723-724`), and the stale-data-wins branch shows a
last-known profile with no sign the refresh failed. Both are their own tasks.
