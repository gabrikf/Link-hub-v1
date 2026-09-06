---
name: plan
description: "Interview the developer about a change, then write one plan file to docs/plans/ whose checkboxes the implement skill uses as its progress ledger. Use for a change big enough that starting to code would mean guessing — a few files, a new endpoint, a refactor with a blast radius — and whenever the user says plan it, think before coding, or how should we do this. Do NOT use it to implement (that is implement), and do NOT use it for a multi-screen feature that arrives with a design and acceptance criteria — that is the heavier spec-writer lane."
argument-hint: "<what you want built> [--all-default]"
---

# Plan — one file, six sections, no placeholders

`/plan` interviews, writes `docs/plans/YYYY-MM-DD-<slug>.md`, and **stops**. It
writes no code. `/implement <path>` picks it up, in a fresh session by default.

`.agents/references/linear-github.md` carries `--all-default` and the argument
fallback. English file; answer the user in their own language.

## Which lane

| The change is…                                              | Use            |
| ----------------------------------------------------------- | -------------- |
| a few files, one surface, clear when described              | `plan` here    |
| multi-screen, arrives with a design and acceptance criteria | `spec-writer`  |
| a reported defect                                           | `bug-resolver` |

The two lanes are not interchangeable. `spec-writer` produces a spec tree under
`docs/specs/` with its own verification harness; this produces one markdown file.
Say which lane you picked and why, in one line, before you start.

## 1. Read before asking

Read what the request already names, plus the rules that will bind it. **Cite
them; never copy them into the plan** — `AGENTS.md` for the non-negotiables,
`apps/api/AGENTS.md` or `apps/web/AGENTS.md` for the surface, `DESIGN.md` for
anything visible, `packages/schemas/AGENTS.md` for a boundary shape.

A plan that restates the non-negotiables is a plan nobody rereads.

## 2. Interview — at most five questions, one per turn

`references/interview.md` has the exact shape. In short: one full interrogative
sentence, one line on why it matters, two to five mutually exclusive options, and
a **Recommended** line with its reason.

Stop when the critical ambiguity is gone, when the user says done, or at five.
Everything still unknown becomes an `[ASSUMPTION]` line in the plan — never a
sixth question.

Under `--all-default`, show each question with its recommended answer already
taken and do not wait.

## 3. Write the file

`references/plan-template.md` is the template; the six sections are exact.

**Size it to the work.** A change touching three files or fewer gets a plan of
about twenty lines. A plan longer than the diff it describes is a cost, not a
safeguard.

Two things that make a plan worthless, both easy to do by accident:

- **A placeholder.** Never "TBD", never "add appropriate error handling", never
  "update the relevant tests". If you do not know, it is an `[ASSUMPTION]`.
- **A Definition of Done nobody can check.** Every Automated box names a command
  someone can run. Every Manual box names a route someone can open.

## 4. Offer the reviewer

Offer to run the `plan-reviewer` subagent before the user approves. It reads the
plan and the files it names, and reports what it would have to guess. Accepting
is the default; declining is fine, and is recorded in one line.

In a tool with no subagent concept (Codex, Kiro), run `.agents/agents/plan-reviewer.md`
as a fresh session instead.

## 5. Stop

Print the path, and the exact line to continue with:

```
/implement docs/plans/YYYY-MM-DD-<slug>.md
```

Say plainly that a **fresh session** is the default, because conversation memory
does not survive compaction and the plan file is what does. `--same-session`
exists for a small change; it prints a one-line warning about carried context.

Do not start implementing. Not even the first task, not even if it is trivial.
