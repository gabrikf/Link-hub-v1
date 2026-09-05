# Linear and GitHub — the shared reference

Everything the workflow skills reuse, written once. `commit-push-pr`,
`bug-resolver`, `linear-work`, `plan` and `implement` cite this file by path;
none of them repeats it. English, like everything under `.agents/` — the agent
still answers the user in the user's own language.

## GitHub

**Never hardcode the org or the repo.** Resolve them at runtime with
`git remote get-url origin`. Both `https://github.com/<org>/<repo>.git` and
`git@github.com:<org>/<repo>.git` appear in the wild — parse both. No remote, or
one that is not GitHub, means the `pr` step is skipped with a line saying so.

**Base branch defaults to `main`**, because `.github/workflows/ci.yml` triggers
on `pull_request` into `main` only. `develop` exists and takes merges; a PR into
it gets **no CI at all**. If the base is anything but `main`, say so in the PR
body and run the gate locally instead.

| Need                 | Command                                                    |
| -------------------- | ---------------------------------------------------------- |
| is `gh` usable       | `gh auth status`                                           |
| is a PR already open | `gh pr list --head <branch>`                               |
| open one             | `gh pr create --base <target> --title <t> --body-file <f>` |
| update the open one  | `gh pr edit <n> --title <t> --body-file <f>`               |
| confirm it landed    | `gh pr view --json url,number`                             |

Always `--body-file`. A `--body` with escaped `\n` renders as one long line.

URL shapes: `.../pull/<n>`, `.../tree/<branch>`, `.../issues/<n>` under
`https://github.com/<org>/<repo>`.

## Linear

**Discovery-first, always.** Nothing about Linear is hardcoded here — not the
team key, not a tool name, not a workflow-state id, not a filter. A Linear team
defines its own workflow states, and the MCP server's tool names differ between
the hosted connector and a local install.

So, in this order, every time:

1. **List the server's tools** and pick the one whose description matches what
   you need. Do not guess a tool name from memory.
2. **Read the viewer and their teams** from the server. The team key comes from
   that answer, never from a constant in this repo.
3. **Read the team's workflow states** before any transition, and match on the
   state's own name — "In Review", "Code Review", whatever this team calls it.
   A state id copied into a file is wrong the day someone renames a column.
4. **Read the labels** before filtering by one.

Issue keys look like `<TEAM>-<number>` — match them with `[A-Z][A-Z0-9]+-\d+`.

**Branch naming** follows Linear's own "copy git branch name" button:
`<username>/<key>-<slug>`, lowercased. Creating a branch in that shape is what
lets Linear associate the branch with the issue on its own.

**No server, or it does not answer:** say so in one line, do the code work
anyway, and end by listing the exact Linear actions the user should take by
hand. Never invent an issue key, and never claim an issue was updated.

## PR ↔ Linear linking — detect it, do not assume

With Linear's GitHub integration enabled, `Closes <KEY>` in the PR body links the
PR to the issue and transitions it on merge. With it disabled, that line is inert
text.

Do not ask the user which it is, and do not store the answer here:

1. Put `Closes <KEY>` in the PR body whenever an issue key is known. It is
   harmless when the integration is off.
2. After the PR is open, **re-read the issue** through the MCP.
3. Attachment or state moved → the integration is live; say so and stop.
4. Nothing moved → the integration is off; comment the PR URL and the branch
   name on the issue instead, and move the state explicitly (step 3 above).

## `--all-default`

Passed as an argument, the user has already confirmed — do not ask again. Typed
mid-flow, ask once, then stop asking. After that: take every default, or option
1 where there is no default, and narrate each choice as it is made.

It **never** skips the red test, `npm run guardrails`, or the `dod-auditor` run.
Those are the three things the flag exists alongside, not instead of.

## Arguments

`$ARGUMENTS` is substituted by Claude Code. Where it is not — Kiro, Cursor,
Codex, Copilot — the words the user typed after the skill name are the
arguments. None at all → show the menu rather than assuming a default.

## Portable git

These run identically in bash, zsh and PowerShell.

| Need                  | Command                                                          |
| --------------------- | ---------------------------------------------------------------- |
| current branch        | `git branch --show-current`                                      |
| is the tree dirty     | `git status --porcelain`                                         |
| is there an upstream  | `git rev-parse --abbrev-ref --symbolic-full-name "@{u}"`         |
| unpushed commits      | `git log --oneline "@{u}..HEAD"` — **only after** the line above |
| what a commit touched | `git diff --stat`                                                |

Order matters: `@{u}..HEAD` errors on a branch with no upstream, and that error
reads like "no commits" if you do not check for the upstream first.
