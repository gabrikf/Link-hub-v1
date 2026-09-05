# CodeRabbit — the local CLI

## Preflight

Run `coderabbit auth status`, then branch:

- **Signed in** → proceed.
- **Not signed in, and `CODERABBIT_API_KEY` is in the environment** → authenticate
  from the variable, **never echoing its value**:
  - bash / zsh: `coderabbit auth login --api-key "$CODERABBIT_API_KEY"`
  - PowerShell: `coderabbit auth login --api-key $env:CODERABBIT_API_KEY`
- **Not signed in, no variable** → print `coderabbit auth login` for the user to
  run, and **wait**. Skipping a step the user explicitly selected is not the
  agent's call.
- **Not on PATH** → say so once, name the install page, skip the step.

Never print, log or commit the key. Not in a transcript, not in a report, not in
a commit message.

## CLI is not the bot

`coderabbit review` runs **on this machine, against this diff, before the PR
exists**. The CodeRabbit GitHub bot is a separate product that reviews a PR after
it opens, and only if the repository is installed on app.coderabbit.ai. Nothing
in this repo configures it — there is no `.coderabbit.yaml`.

So: a bot review is possible, never expected. Do not wait for one, and never let
its absence pass as "the code was reviewed".

## Running it

Choose by tree state, not by habit:

| Tree                           | Command                                                 |
| ------------------------------ | ------------------------------------------------------- |
| clean, after `commit` ran      | `coderabbit review --agent --committed --base <target>` |
| dirty, reviewing before commit | `coderabbit review --agent --uncommitted`               |

`coderabbit review findings` re-reads the last run without paying for another.
`coderabbit doctor` is the one-shot diagnosis when the CLI itself misbehaves —
run it from your own terminal, not from inside a flow.

## Triage

Every finding gets a decision, by judgment, one of two:

- **Apply it** — as a root-cause fix, with the gate still green afterwards. Not a
  suppression, not a cast, not a widened schema.
- **Decline it** — with a one-line reason. A finding that does not fit this
  codebase is a fine thing to decline; an unexplained one is not.

Show the result as a table, every finding on a row:

| #   | Finding | Decision    | Reason         |
| --- | ------- | ----------- | -------------- |
| 1   | …       | ✅ applied  | …              |
| 2   | …       | ⏭️ declined | why, in a line |

A declined finding is **never** dropped from the table. Everything applied lands
in one follow-up commit, so the review is legible in the history.
