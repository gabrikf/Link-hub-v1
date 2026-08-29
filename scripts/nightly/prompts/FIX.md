## PHASE: FIX — one bug, red test first

You fix **exactly one** bug: the one in `current_bug_id`. Nothing else. If you
notice another problem on the way, add it to `QUEUE.candidates` and keep going.

If `review_feedback` is set in STATE.json, a reviewer **rejected your
predecessor's attempt**. Read it first and address it specifically — do not
start over from scratch unless the feedback says the approach was wrong.

### The two-commit protocol — this is the contract

The deliverable is not "the bug is gone". It is **provable in git history** that
a test failed before the fix and passed after it.

**Commit 1 — the red test.**
1. Write the test at the layer TRIAGE chose in `test_plan`. Vitest everywhere
   (`describe/it/expect` from `vitest`); there is no jest in this repo. A whole
   journey goes in `e2e/journeys/` as a Playwright spec instead.
2. **Run it and watch it fail.** Read the failure output and confirm it fails
   **for the right reason** — the bug's actual symptom, not a typo, a missing
   import, or a bad selector. A test that fails for the wrong reason proves
   nothing and will pass after the fix by accident.
3. Paste the failing output into the commit body.
4. Commit **only the test**:
   ```bash
   git add <test files only>
   git commit -m "test(<BUG-ID>): failing regression test for <symptom>"
   ```

**Commit 2 — the fix.**
5. Fix the **cause**, not the symptom. The `no-workarounds` skill is law here: no
   type assertion, no `eslint-disable`, no `.skip`, no widened zod schema, no
   swallowed error, no timing hack to make the signal go away. If the honest fix
   is out of scope, stop and escalate rather than papering over it.
6. Contract first: if a shape crossing api↔web↔mcp changes, change
   `packages/schemas/src/<module>/` **first**, run `npm run build:schemas`, then
   the api handler, then the web caller. Never define a local type to unblock
   yourself, never widen a schema so a bad payload passes.
7. Run the test again and watch it **pass**.
8. Run the gate:
   ```bash
   npm run build:schemas
   node scripts/guardrails/pre-push.mjs
   ```
   It must print `guardrails PASS`. If it fails, fix the cause. Never
   `--no-verify`, never a `.skip`, never an inline disable.
9. Commit the fix:
   ```bash
   git add <source files>
   git commit -m "fix(<BUG-ID>): <what changed, in user words>"
   ```

### Scope discipline

- Touch the smallest set of files that fixes the cause.
- Do not reformat, rename, or tidy anything you are not fixing. A reviewer
  cannot separate your fix from your housekeeping, and neither can the person
  reading the diff tomorrow morning.
- Do not edit an existing test to make your change pass. If an existing test now
  genuinely encodes wrong behaviour, say so explicitly in the commit body and in
  MEMORY.md — that is a decision for a human, not a quiet edit.
- Follow `DESIGN.md` for anything visual: `SURFACE*` / `BADGE*` / `FOCUS_RING*`
  from `apps/web/src/shared-components/surface.ts`, never hand-written class
  strings; every colour utility needs its `dark:` counterpart; `violet` accent
  and `zinc` neutrals only.

### Record

Update the bug's entry in `QUEUE.confirmed[]`:
```json
{
  "status": "fixed-pending-review",
  "red_commit": "<sha of commit 1>",
  "fix_commit": "<sha of commit 2>",
  "test_paths": ["…"],
  "files_changed": ["…"],
  "gate_result": "the verbatim last lines of pre-push.mjs"
}
```
Clear the feedback you addressed:
```bash
node scripts/nightly/state.mjs set review_feedback 'null'
```
Append to MEMORY.md: what the cause actually was (this is the most valuable
thing you can leave behind), and anything that made the fix harder than it
looked.

### If you cannot fix it honestly

Move the bug to `QUEUE.escalated[]` with what you tried, why the honest fix is
out of scope tonight, and a recommendation for a human. Set `next_phase` to
`TRIAGE`. **This is a good outcome.** Shipping a workaround the night before a
deploy is not.

### Then stop

```bash
node scripts/nightly/state.mjs set next_phase '"REVIEW_FIX"'
```
Legal: `REVIEW_FIX` (you committed a fix), `TRIAGE` (you escalated instead),
`REPORT` (out of time).
