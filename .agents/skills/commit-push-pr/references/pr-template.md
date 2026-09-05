# PR body template

Fill it, write it to a file, pass it as `--body-file`. Drop any section that has
nothing true to say — an empty heading is worse than no heading. The same
sections live in `.github/pull_request_template.md`, so a PR opened by hand and
one opened by this skill read alike.

```markdown
## Summary

What changed, in plain words. Two or three sentences.

## Root cause

Bug fixes only. What was actually wrong — not the symptom, and not the fix.

## Changes

- `path/to/file.ts` — why this file.

## How to test in the UI

Route, how to get there, which filters or fixtures, and which seeded account to
sign in as (`npm run db:seed:all`). "It builds" is not a test.

## What was not verified

Not optional. Name what you did not run and why. A summary that omits the
untested part is the most expensive kind of wrong.

Closes <KEY>
```

Notes:

- `Closes <KEY>` goes in only when an issue key is known. Harmless if Linear's
  GitHub integration is off.
- If the base is not `main`, add one line saying so and that CI therefore did not
  run — `.github/workflows/ci.yml` triggers on PRs into `main` only.
- If a human used `--no-verify` to get here, that belongs in the body too.
  `.husky/pre-push` says so itself.
