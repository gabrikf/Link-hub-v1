---
name: linear-work
description: "Invoked by name with /linear-work. Lists your Linear issues in the active cycle, renders one issue as a full card — description, every comment, attachments and classified links — and routes it to the right workflow by reading the issue's own label or type. Use when the user asks what they are working on, what is in the cycle, to pick up or open a Linear issue, or names an issue key with no other instruction. Do NOT use to create or estimate issues, to report on someone else's work, or as a general Linear client — it reads the cycle and hands off to bug-resolver, implement or plan."
argument-hint: "[<issue-key>] [label:<name>] [<raw filter>] [--all-default]"
disable-model-invocation: true
---

# Linear work — see the cycle, open a card, take a route

`.agents/references/linear-github.md` is the contract for every Linear call in
this file. Read it first. The rule that matters most: **discovery-first** — list
the server's tools, read the viewer's teams, read the team's own workflow states
and labels. Nothing about your Linear is written down in this repo.

English file; answer the user in their own language.

## A note on invocation

`disable-model-invocation: true` keeps Claude Code from loading this skill on its
own. **Codex and Kiro have no such field**, so in those tools the only guard is
the first clause of the description above: this skill is invoked by name. If you
are reading it without the user having typed `/linear-work`, stop and ask.

## 1. Connect, or say you could not

List the MCP server's tools and identify the ones for: the current user, their
teams, issues by filter, one issue with comments, the team's workflow states,
and the team's labels.

No Linear server, or it does not answer → say so in one line and stop. Do not
substitute a guess, and do not fall back to GitHub issues.

## 2. The list

Default: **the developer's own issues in the active cycle, not Done.**

Build that filter from the server's own tool schema — assignee = the viewer,
cycle = the active one, state type not completed and not cancelled. The exact
argument names differ between server builds; read them from the listing rather
than from this sentence.

An argument overrides the default:

- an issue key (`[A-Z][A-Z0-9]+-\d+`) → skip the list, go straight to the card;
- `label:<name>` → filter by that label, after reading the team's real labels;
- anything else → treat it as a raw filter and say what you interpreted.

Render the list compactly — key, title, state, priority — and ask which one.
Empty list is an answer: say the cycle has nothing assigned, and stop.

## 3. The card

Render the chosen issue with `references/issue-card.md`. Read it whole before
routing — the route depends on what the card says.

## 4. Route, by the issue's own label

**Read the route; do not ask for it.** The issue's label or type decides:

| The issue is…                      | Route                                                       |
| ---------------------------------- | ----------------------------------------------------------- |
| labelled bug / defect / regression | `bug-resolver`, with the key as its argument                |
| anything else, and non-trivial     | `plan` first, then `implement` on the file it writes        |
| anything else, and small           | `implement` directly, or `plan` if the scope is unclear     |
| large, multi-screen, with a design | `spec-writer`, then `spec-implement` — the heavyweight lane |

Then offer, as a menu:

1. The routed workflow above (say which, and why the label chose it).
2. A Linear-only action — comment, change state, assign — all discovery-first.
3. Nothing. Close the card and stop.

Option 3 must stay genuinely free: **reading a card writes nothing.** No state
change, no comment, no assignment happens because the user looked at an issue.

## 5. Hand-off

Whichever route is chosen, hand over the **issue key**, the title, and the
acceptance criteria you read off the card. The receiving skill owns the branch
and the base-branch question from there — do not create the branch here.

`bug-resolver` will re-read the issue itself. That is deliberate: it needs the
comments in its own context, not a summary of them.
