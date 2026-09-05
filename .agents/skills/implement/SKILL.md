---
name: implement
description: "Execute a plan file written by the plan skill: read only the plan and the files it names, work task by task ticking the plan's own checkboxes as the ledger, write the failing test before the fix, gather the three-sensor proof pack, close the gate, and have the dod-auditor subagent verify the Definition of Done before handing off to commit-push-pr. Use when the user says implement, execute the plan, or points at a file in docs/plans/. Do NOT use without a plan file (write one with plan first), and do NOT use for a spec under docs/specs/ — that is spec-implement."
argument-hint: "<path to the plan file> [--same-session] [--all-default]"
---

# Implement — the plan file is the ledger

Start **fresh**. Read the plan, and only the files it names. Conversation memory
does not survive compaction; the checkboxes in the plan file do.

`--same-session` is allowed for a small change. It prints one line warning that
carried context can make you believe something is done that is not.

`.agents/references/linear-github.md` carries `--all-default` and the argument
fallback. English file; answer the user in their own language.

## 1. Orient

Read the plan whole, then the files its **Current state** and **Tasks** name.
Do not survey the repo — the plan already did.

If the plan contains a placeholder ("TBD", "add appropriate error handling"),
stop and say so. That is a defect in the plan, not something to interpret.

Re-check each `[ASSUMPTION]` you can cheaply check. One that turns out false is
worth more than the whole first task.

## 2. Task by task

For each task, in order:

1. **Red first.** Mandatory for a bug; strongly recommended for a feature. Write
   the test, run it, and confirm it fails **for the reason you expect**.
2. **Make it green** with the smallest change at the cause.
3. **Finish the coverage in the same task** — the edge cases and the error
   branches the plan named. Coming back later is a thing nobody does.
4. **Tick the box in the plan file.** Not in your head, not in the transcript —
   edit `docs/plans/<the file>`. That is the ledger.

Never edit an existing test to make your change pass unless the plan says the
behaviour changed. Check the blast radius first.

If coverage rose, measure it and raise the floor **in the same commit**:

```bash
npm run test:coverage --workspace=api
```

The thresholds live in `apps/api/vitest.config.ts` and may only go up.

## 3. The proof pack — three sensors, with an applicability rule

| #   | Sensor                                                                    | When                                 |
| --- | ------------------------------------------------------------------------- | ------------------------------------ |
| 1   | the changed workspace's vitest run                                        | **always**                           |
| 2   | one `*.e2e.test.ts` against the real Fastify app, with docker up          | only if `apps/api` or the DB changed |
| 3   | a read through the `postgres` MCP server, by a correlation id you control | only if `apps/api` or the DB changed |

Sensor 2 needs `bash db-manage.sh start` (on Windows: Git Bash or WSL) and is
built on `apps/api/src/infra/http/test-support/build-test-app.ts`;
`apps/api/AGENTS.md` says which files need docker, MinIO, Mailpit or an
`OPENAI_API_KEY`.

Sensor 3 is read-only, local dev database only. "It returned 201" is not
evidence that a row landed.

**Report every sensor either as run, with its output, or as "not applicable — no
API or DB surface changed".** Silence about a sensor reads as a pass.

Then add, by what the change touched:

- anything user-visible → the `visual-check` skill;
- a harness-only change → `npm run harness:check` instead of sensors 2 and 3.

**Before trusting any browser, e2e or API probe, confirm ports 3333 and 5173
belong to this app.** An eight-hour nightly run here once produced zero signal
because both were owned by a different project and every probe answered happily.
`guardrails-repair` carries the detail.

## 4. The gate

```bash
npm run guardrails
```

Red → `guardrails-repair`. Never `--no-verify`, never an `eslint-disable`, never
a `.skip`, never a widened schema.

## 5. The audit — not optional

Write the diff to a file, then dispatch the `dod-auditor` subagent with: the
plan's Definition of Done, that diff file, and your hand-off report **explicitly
labelled as unverified claims**.

```bash
git add -A && git diff --cached > <path>
```

**Stage first.** A plain `git diff` shows neither staged nor untracked files, so
every file the task _created_ — the red test above all — would be missing from
the one artefact the auditor judges Stage 2 on.

`--all-default` does not skip this. Nothing skips this.

**Codex and Kiro have no subagent concept.** There, run `.agents/agents/dod-auditor.md`
as a fresh session against the same three inputs. The audit still happens; only
the dispatch differs.

Fix findings, re-run, at most **three rounds**. Still blocking after three →
escalate to the user with the open findings listed. Do not quietly ship past one.

## 6. Hand-off report

Under fifteen lines:

- **Status** — `DONE` · `DONE_WITH_CONCERNS` · `BLOCKED` · `NEEDS_CONTEXT`.
- **What changed**, by file.
- **TDD evidence** — the RED command, its failing output, why that failure was
  the expected one; then the GREEN command and its passing output.
- **The proof pack** — each sensor run, or marked not applicable.
- **What you could not verify.**

Warnings and noise in the test output are findings, not decoration. Quote them.

## 7. Ship

Hand off to `commit-push-pr`. Offer all five steps; the user picks.

## Banned outright

Mirror assertions. Mock-existence assertions. Change detectors. Partial mocks
missing fields the code actually reads. Each passes for the wrong reason, which
is worse than not testing at all — it spends the budget and buys nothing.
