---
name: commit-push-pr
description: "Ship finished work — commit it, run a CodeRabbit review, push it, open or update the GitHub PR, and record it on the Linear issue. Five independent steps: name any subset in any order, or none to get a status line and a menu. Use when the user says commit, push, open a PR, ship it, or when another skill hands off finished code. Each step checks its own precondition and skips with one line saying why. Do NOT use to write the code, to fix a red gate (that is guardrails-repair), or to review someone else's PR (that is deep-review) — and it never passes --no-verify."
argument-hint: "[commit] [review] [push] [pr] [linear] [--issue <KEY>] [--base <branch>] [--all-default]"
---

# Commit · review · push · PR · Linear

Five steps that stand alone. `.agents/references/linear-github.md` carries the
`gh` commands, the Linear discovery rules, the `--all-default` contract, the
`$ARGUMENTS` fallback and the portable git table — read it, do not restate it.

English file; answer the user in their own language.

## Always first: the status line

Print this **before** any menu, and ask nothing to build it.

```
branch <name> · issue <KEY|none> · <n> file(s) dirty · <n> unpushed · PR <url|none>
tools: gh <ok|missing> · coderabbit <ok|not signed in|missing> · linear <ok|missing>
```

How each field is found:

- **branch** — `git branch --show-current`.
- **issue** — `--issue` wins; then the key a calling skill handed over; then the
  issue-key regex against the branch name; then none. Never invent one.
- **dirty** — count the lines of `git status --porcelain`.
- **unpushed** — check the upstream **first**, then `git log --oneline "@{u}..HEAD"`.
  No upstream is not zero commits; it is "never pushed".
- **PR** — `gh pr list --head <branch>`.
- **tools** — `gh auth status`, `coderabbit auth status`, and whether a Linear MCP
  server is present and answering.

## Choosing steps

`$ARGUMENTS` names the steps to run, in the order given. No arguments → print the
status line, then a menu of the five, and wait.

A step whose precondition is not met is **skipped with exactly one line saying
why**, and the remaining steps still run. Skipping is never silent.

`--all-default` behaves as the reference defines it. It does not skip the gate.

---

## `commit`

**Precondition:** `git status --porcelain` is non-empty. Empty → "nothing to
commit" and move on.

1. **Run `npm run guardrails` first.** The husky `pre-commit` hook formats staged
   files and autofixes what eslint can, but it never runs tests or the type-aware
   layer — it is not the gate. Red → hand to `guardrails-repair`. Never
   `--no-verify`; there is no sanctioned exception.
2. **Stage only what belongs to this change.** Read the diff. Name anything left
   unstaged and why, in one line, rather than sweeping it in.
3. **Write Conventional commits.** `type(scope): description`. More than one
   logical change means more than one commit. When a calling skill handed over a
   summary, that summary is the body.
4. Print the resulting `git log --oneline` lines.

Commit-message language is the repo's convention, not a hook — nothing in
`.husky/` enforces it. Follow what `git log` already does.

## `review`

**Precondition:** `coderabbit` is on PATH and authenticated. Not installed → skip
with the install line. Not authenticated → follow the preflight tree in
`references/coderabbit.md`, which waits for the user rather than skipping a step
they asked for.

Read `references/coderabbit.md` before running anything. In short: clean tree
after `commit` → `--committed`; dirty tree → `--uncommitted`. Every finding is
applied or declined with a one-line reason, shown in a summary table, and what
was applied lands in one follow-up commit. A declined finding is never hidden.

The local CLI and the CodeRabbit GitHub bot are **two different products**. This
step is the local one. Nothing in this repo configures the bot, so never wait for
a bot review and never let its absence count as a review.

## `push`

**Precondition:** there are unpushed commits, or the branch has no upstream.

1. No upstream → `git push -u origin <branch>` and skip the log check entirely.
2. Otherwise push normally.
3. The husky `pre-push` hook runs the full gate here. Red → `guardrails-repair`.
4. **Rejected as non-fast-forward:** explain what that means, propose
   `git pull --rebase`, and **ask** before running it. Never force-push on your
   own initiative.

## `pr`

**Precondition:** the branch exists on the remote. Not pushed → skip and say
"run `push` first".

1. Target base: `--base`, else what the caller passed, else ask with `main` as
   the default. `main` is the only branch CI gates — if the base is anything
   else, say so in the body.
2. Already open (`gh pr list --head <branch>`) → `gh pr edit`, not create.
3. Write the body to a file from `references/pr-template.md`, then pass
   `--body-file`. Never an inline `--body` with escaped newlines.
4. Include `Closes <KEY>` when an issue key is known — the reference explains why
   that is safe whether or not the Linear integration is on.
5. Verify with `gh pr view --json url,number` and print the clickable URL.

## `linear`

**Precondition:** an issue key **and** a Linear MCP server that answers. Either
missing → one line saying the step was skipped, plus the exact list of actions
for the user to do by hand.

Everything here is discovery-first, per the reference: list the server's tools,
read the team's own workflow states, and match a state by **name**. There is no
hardcoded state id anywhere in this repo, and none may be added.

Sub-menu, all selected by default:

- **Comment** the PR URL and the branch name on the issue.
- **Move state** to the team's own "in review" / "code review" state, whichever
  it actually has.
- Anything else only if the team's Linear genuinely has it. Linear has no
  built-in "AI adoption" field; do not set a custom field that the server did not
  report.

Then re-read the issue and report what actually changed — not what was sent.

---

## Report

- One line per step: ran, or skipped and why.
- The commits, by subject.
- The CodeRabbit summary table, if `review` ran.
- The PR URL.
- What changed on the Linear issue, read back rather than assumed.
- Anything you could not verify.
