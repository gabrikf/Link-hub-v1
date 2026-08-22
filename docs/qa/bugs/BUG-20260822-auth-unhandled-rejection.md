# BUG-20260822-auth-unhandled-rejection: every failed login or registration escapes as an unhandled promise rejection carrying the user's email

- **Status:** open
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

A wrong password is the most common failure in any app. On LinkHub every one of
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
- **Not re-reproduced in run `2026-08-22T18:58:46.702Z`.** Carried in from the hand-off on the strength of those assertions plus the code reading below. FIX must reproduce it first.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — uncaught rejections on every auth failure. *Cause* — `apps/web/src/features/auth/components/register-form.tsx:52` does `handleSubmit(async (data) => { await onSubmit(data); reset(); })` and `login-form.tsx:34` does `handleSubmit(onSubmit)`, where `onSubmit` is `auth-page.tsx`'s `mutateAsync` wrapper (lines 131/135). react-hook-form re-throws whatever the valid-handler rejects with, so every rejected `mutateAsync` escapes. Sentry init: `apps/web/src/lib/report-error.ts:90`.
- **Root Cause (taxonomy):** unhandled-error-path
- **Fix commit:** —
- **Regression test:** component test with `@testing-library/react` beside each form — submit, reject the mutation, assert the error renders **and** that no unhandled rejection is produced. One fix covers both forms (catch inside the submit handler, or use `mutate` instead of `mutateAsync`). The e2e guard assertions already cover the user-visible half.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
