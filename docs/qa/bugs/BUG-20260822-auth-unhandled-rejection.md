# BUG-20260822-auth-unhandled-rejection: every failed login or registration escapes as an unhandled promise rejection carrying the user's email

- **Status:** fixed — `0fe91ff`, review APPROVED 2026-08-23 (run `2026-08-22T18:58:46.702Z`, iteration 29)
- **Impact (user-side):** Privacy — user emails are shipped to Sentry on a routine error path
- **Severity:** High · **Priority:** P1
- **Persona Affected:** Nina, the arriving developer — every person who ever mistypes a password
- **Journey Step:** J-signup-resume, the sign-in / sign-up step
- **Theme:** both (the defect is behavioural, not visual)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `BUG-20260822-auth-unhandled-rejection`, carried in from the QA hand-off, confirmed into run `2026-08-22T18:58:46.702Z` at iteration 4 (TRIAGE)

## Summary

A wrong password is the most common failure in any app. On CraftHub every one of
them throws an uncaught promise rejection out of the form.

The visible behaviour is fine — the error renders, no tokens are written — so
nobody notices. What notices is Sentry's global `unhandledrejection` handler,
which captures it in production. The registration variant's message is `User
with email '<email>' already exists`, and `sendDefaultPii: false` does **not**
scrub that, because the address is in the message string rather than in a PII
field. The result is that a routine typo sends a real user's email address to a
third-party service.

## Reproduction

- **Charter:** none yet · **Tour:** the-unhappy-path tour
- **Environment:** web :5173 · api :3333 · any seeded developer (`bash db-manage.sh seed-all`, password `12345678`)

1. Open `/` and submit the login form with a wrong password.
2. The visible error renders correctly and no tokens are written — but the console shows `uncaught: Invalid email or password`.
3. Repeat with the register form using an email that already exists: `uncaught: User with email '<email>' already exists`.

**Expected:** a rejected mutation is handled by the form; nothing reaches the
global `unhandledrejection` handler, and no email address leaves the browser on
an error path.
**Actual:** both forms produce uncaught rejections, the registration one
carrying the address.

## Evidence

- `e2e/journeys/01-signup-resume.spec.ts:201` and `:255` — the guard assertions that recorded it.
- **Re-reproduced by hand in run `2026-08-22T18:58:46.702Z`, iteration 27 (TRIAGE).** A throwaway jsdom probe rendered `LoginForm` and `RegisterForm` with an `onSubmit` that rejects, with a `process.on("unhandledRejection")` listener attached. Both submits escaped:
  - login → `Error: Invalid email or password`
  - register → `Error: User with email 'ada@example.com' already exists` — **the address is in the message**, which is the privacy half of this bug.
  Probe script and raw vitest output: `.nightly/evidence/BUG-20260822-auth-unhandled-rejection/`. The probe was deleted after the run; FIX writes the real regression test.
- The Sentry half re-read this iteration: `apps/web/src/lib/report-error.ts:83-99` calls `Sentry.init` with default integrations (so the browser `onunhandledrejection` global handler is on) and `sendDefaultPii: false`, which scrubs PII *fields* and not message strings. The leak therefore lands wherever `VITE_SENTRY_DSN` is set.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — uncaught rejections on every auth failure. *Cause* — `apps/web/src/features/auth/components/register-form.tsx:52` does `handleSubmit(async (data) => { await onSubmit(data); reset(); })` and `login-form.tsx:34` does `handleSubmit(onSubmit)`, where `onSubmit` is `auth-page.tsx`'s `mutateAsync` wrapper (lines 131/135). react-hook-form re-throws whatever the valid-handler rejects with, so every rejected `mutateAsync` escapes. Sentry init: `apps/web/src/lib/report-error.ts:90`.
- **Root Cause (taxonomy):** unhandled-error-path
- **Third call site, same mechanism (found at triage, iteration 27):** `auth-page.tsx`'s `useGoogleLogin({ onSuccess: async (t) => { await googleSignInMutation.mutateAsync(...) } })` also awaits a `mutateAsync` inside a handler nobody catches. It is not covered by the two form probes and is not what this bug was filed for, but a fix that only patches the two forms leaves it. Handle it in the same change if it is one line; otherwise say so.
- **Fix commit:** `0fe91ff` (red: `63cc50b`). Both forms now `await onSubmit(data)` inside a `try/catch`; `RegisterForm` returns from the catch so `reset()` runs only on success and the typed values survive a failure. The Google popup's `onSuccess` switched from `mutateAsync` to `mutate`.
- **Regression test:** `apps/web/src/features/auth/components/auth-form-rejection.test.tsx` — four cases: each form with a rejecting `onSubmit` asserted against a `process.on("unhandledRejection")` collector, plus two blast-radius guards (`RegisterForm` keeps what was typed on failure, still clears on success).
- **Gate:** `guardrails PASS` — 50 files / 447 tests (iteration 28). Re-run independently at review: `build:schemas` OK, `check-types` 8/8, `lint-changed` clean over 28 files.

## Verification

**Review APPROVED — 2026-08-23, loop iteration 29 (REVIEW_FIX).**

**Red-then-green, proved twice.**

| lane | at `63cc50b` (red) | at `0fe91ff` (tip) |
|---|---|---|
| `npx vitest related apps/web/src/features/auth/components/auth-form-rejection.test.tsx --run` | 2 failed / 2 passed — the collected reasons are `Error: Invalid email or password` and `Error: User with email 'ada@example.com' already exists` | 4 passed |
| `npx playwright test --project=desktop e2e/journeys/01-signup-resume.spec.ts -g "wrong password"` | **1 failed** — the console-error guard at `:282` | passes; both auth-failure journeys (`:201`, `:255`) green in 7.1s |

The red failures are the bug itself, not an import error or a bad selector — the
register reason literally carries the address, which is the privacy half.

**Why the empty catches are not swallowing.** The parent already holds the same
error in mutation state and renders it (`auth-page.tsx:178` and `:183`), and
TanStack Query captured it *before* react-hook-form re-threw it. The fix removes
a second surfacing of an error that was never lost. Not calling `reportError`
there is deliberate: a wrong password is an expected outcome, and reporting the
register message would re-create the leak this bug is about.

**Checked and clean:** no schema change (no contract surface moved, nothing
widened), no type assertion, no `eslint-disable`, no `.skip`, no edited test
(the fix commit is 3 source files / 38 lines, zero test files), no scope creep.
`LoginForm` and `RegisterForm` are imported only by `auth-page.tsx`, so the blast
radius is one screen. No colour utility added, so no `dark:` gap; the four-state
rule does not apply — the auth page is mutation-only and its error path is what
renders.

**Left for a human (not defects):**

- `e2e/journeys/01-signup-resume.spec.ts:226` and `:278` still carry
  "FINDING — left failing on purpose" comments on assertions that now pass.
  Stale documentation; delete those two comment blocks.
- There is no global `MutationCache` `onError` (`apps/web/src/lib/query-client.ts`),
  so a genuine 5xx during sign-in is now silent in Sentry too. That reporting only
  ever existed as a side effect of this bug; wiring deliberate reporting is its own
  task, and it must not report the register message.
- The same `handleSubmit(mutateAsync)` shape may exist at
  `dashboard-link-form.tsx:47`, `dashboard-profile-form.tsx:94`,
  `resume-edit-dialog.tsx:290` and `advanced-search-page.tsx:139` — unverified, a
  lead for a future hunt.

**Not verified:** the Google popup call site is still untested — reviewed by
reading only (`auth-page.tsx:139-155`); nobody drove a real Google sign-in. The
Sentry half stays reasoned rather than observed: no `VITE_SENTRY_DSN` locally, so
no one watched an event stop arriving. No psql (the bug is entirely client-side),
no visual scenario, no dark capture, and only the two auth-failure journeys were
run rather than the whole of journey 01.
