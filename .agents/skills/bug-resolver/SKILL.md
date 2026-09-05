---
name: bug-resolver
description: "Resolve a reported bug end to end: read the ticket, ask the user what they already know BEFORE investigating, reproduce it, write a test that fails for the right reason, fix the cause, close the gate, and record the root cause on the issue. Use when the user reports something broken, hands over a Linear issue key, says a screen or endpoint misbehaves, or when linear-work routes a bug here. Do NOT use for a new feature (that is plan and implement, or spec-writer for a large one), for a red gate with no user-visible symptom (that is guardrails-repair), or to skip straight to a patch — the failing test comes first."
argument-hint: "[<issue-key>] [--base <branch>] [--all-default]"
---

# Bug resolver — context first, red test second, fix third

Nine phases, in order. The order is the point: the expensive mistake is
investigating before asking the person who reported it what they already know.

`.agents/references/linear-github.md` carries the Linear discovery rules, the
`--all-default` contract and the argument fallback. English file; answer the user
in their own language.

## 1. Select

An issue key as an argument — typed, or handed over by `linear-work` — skips the
search and nothing else. No key → search Linear for the issue, or take a manual
description if there is no ticket at all.

**This phase owns the branch**, whoever invoked the skill:

1. Ask for the base branch, defaulting to `main`.
2. Create the branch in Linear's own shape, `<username>/<key>-<slug>` — that is
   what lets Linear associate it with the issue by itself. No key → a normal
   `fix/<slug>`.

## 2. Read the issue

Description, **every** comment, attachments, linked issues, and the links.
Collect the links; do not open them yet. A comment three weeks old naming the
commit that caused it is the cheapest fix you will ever find.

## 3. Overview, then three questions — in one message

Give a short overview of what you understood, then ask exactly these three, in
one message, all optional:

1. What do you already know about the cause?
2. Which files or areas do you suspect?
3. Which cases must the fix cover?

End with: "answer in one message, by number, or say skip."

**Do not investigate before this message is answered or skipped.** Under
`--all-default`, show the questions with "skipped" beside them and continue.

## 4. Investigate

Only now.

- **Evidence.** If a session-recording MCP server (Jam or similar) is present and
  the issue links a recording, use it for console output, network requests and
  the reproduction steps. If not — and this repo configures none — ask the user to
  paste the console output, the failing request, and the exact steps. **Never
  proceed on a reproduction you had to imagine.**
- **Code.** Search from the issue's own terms: the error string, the route, the
  component name, the endpoint.
- **Reproduce.** Anything visible goes through the `visual-check` skill. Anything
  API-side gets an actual request. Before believing any browser or API result,
  confirm ports 3333 and 5173 belong to **this** app — see `guardrails-repair`.
- **Data.** If a write is in question, prove it through the `postgres` MCP server
  by a correlation id you control. "It returned 201" is not evidence.

## 5. Plan, and get approval

Four short parts: **the cause** (not the symptom), the strategy, the files you
will touch, the tests you will write. Then: "approved? 1 yes / 2 adjust".

If you could not establish the cause, say that instead of proposing a fix. A
guess dressed as a diagnosis is the most expensive thing in this file.

## 6. Red test

Write the test **before** the fix, and watch it fail.

`references/red-test.md` says where the test belongs. Run it:

```bash
npm run test --workspace=api -- <path>
npm run test --workspace=web -- <path>
```

Then quote the failure and say **why that failure is the expected one**. A test
that fails because of a typo in its own setup is not a red test. If it passes
first time, you have not reproduced the bug — go back to phase 4.

## 7. Fix the cause

Load `no-workarounds`. The fix removes the cause; it does not make the symptom
unobservable. Forbidden here as everywhere: `any`, a widened zod schema, an
inline `eslint-disable`, `.skip`, `--no-verify`.

Then the same test goes green, and you say so with its output.

## 8. Gate, then record

```bash
npm run guardrails
```

Red → `guardrails-repair`. Never `--no-verify`.

Green → comment the **root cause** on the Linear issue: what was wrong, why it
happened, what now prevents it. Discovery-first, per the reference. No Linear MCP
→ print the comment for the user to paste, and say that is what you did.

## 9. Hand off

Three options, no more:

1. `commit-push-pr` with all steps — commit, review, push, PR, Linear.
2. `commit-push-pr commit` only, and straight on to the next bug.
3. Stop here.

## Report

The `AGENTS.md` output contract, plus the root cause in one sentence, the RED
command with its failing output, and the GREEN command with its passing output.
Name what you did not verify. That part is not optional.
