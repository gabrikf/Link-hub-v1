## PHASE: REVIEW_FIX — an independent agent checks the fix

You did not write this fix and you owe it no loyalty. Your job is to find the
reason it should not ship. If you cannot find one, approve it.

Read the bug in `QUEUE.confirmed[]` matching `current_bug_id`, and its
`red_commit` / `fix_commit`.

### 1. Verify the red-then-green claim mechanically

Do not trust the commit message. Prove it:

```bash
git stash list                                  # must be empty; the tree must be clean
git checkout <red_commit>
# run ONLY this bug's test — it MUST FAIL here
npx vitest related <test path> --run             # or: npx playwright test <spec>
git checkout nightly/qa-hardening
npx vitest related <test path> --run             # or: npx playwright test <spec>  — MUST PASS
```

- Test **passes** at `red_commit`? The test does not actually detect the bug.
  **Reject.**
- Test fails at `red_commit` for a *different* reason than the bug (import
  error, bad selector, missing fixture)? **Reject** — it proves nothing.
- Test fails then passes for the right reason? Good, continue.

Always return to `nightly/qa-hardening` before you finish, whatever you decide.

### 2. Review the fix itself

Run `/deep-review --base <red_commit>` over the fix commit, and additionally
judge it by hand against:

- **Root cause, not symptom.** Would the bug come back through a slightly
  different path? Is the real defect still there with its signal muted? Look for
  the `no-workarounds` signals: type assertions, `eslint-disable`, `.skip`,
  widened zod schemas, swallowed errors, timing hacks, monkey patches.
- **Contract integrity.** If a boundary shape changed, did
  `packages/schemas/src/**` change first and get rebuilt? Was a schema **widened**
  so a bad payload now passes? That converts a caught contract break into a
  silent runtime bug and is an automatic **reject**.
- **Blast radius.** What else calls this code? Search for every caller. A fix
  that repairs one screen and breaks two others is worse than the bug.
- **Scope creep.** Reformatting, renames, drive-by "improvements" mixed into the
  fix commit → **reject** and ask for a clean commit.
- **Edited tests.** Did the fix modify an existing test to make itself pass? That
  is a reject unless the commit body argues convincingly that the old test
  encoded wrong behaviour.
- **Design conformance** for anything visual: `DESIGN.md`, `SURFACE*` constants,
  a `dark:` counterpart for every colour utility, `--profile-accent-*` inside
  `.profile-root`.
- **The four-state rule** for any screen that reads from the network: loading,
  empty, error, filled — all four handled.

### 3. Confirm the user-visible fix

Re-walk the bug's own reproduction steps from a real entry point, exactly as
written in the bug entry, and confirm the harm is gone. A green test with a
still-broken screen is a reject. For anything visual, check **both themes**.

### 4. Verdict

**APPROVE** — move the bug to `QUEUE.fixed[]` with `review: {verdict:
"approved", reviewed_at, notes}`. Increment `counters.fixed`. Clear the claim:
```bash
node scripts/nightly/state.mjs set current_bug_id 'null'
node scripts/nightly/state.mjs set review_feedback 'null'
```
Set `next_phase` to `TRIAGE` (more bugs to work) or `REGRESSION` (the confirmed
queue is empty).

**REJECT** — leave the bug in `confirmed[]` with `status: "fix-rejected"`, and
write precise, actionable feedback:
```bash
node scripts/nightly/state.mjs set review_feedback '"<what is wrong, and what the next attempt must do differently>"'
node scripts/nightly/state.mjs set next_phase '"FIX"'
```
Do **not** fix it yourself. A fresh FIX agent takes your feedback. After three
rejected attempts on one bug the loop escalates it automatically.

Append your reasoning to MEMORY.md either way — an approved fix's reasoning is
what stops the next iteration re-reviewing it.

### Then stop

Legal next phases: `FIX` (rejected), `TRIAGE` (approved, more work),
`REGRESSION` (approved, queue empty), `REPORT` (out of time).
