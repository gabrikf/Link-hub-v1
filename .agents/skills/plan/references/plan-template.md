# Plan template — six sections, exactly

Write to `docs/plans/YYYY-MM-DD-<slug>.md`. Nothing else goes in the file.

```markdown
# <Title> — <one-line what and why>

## Goal

One sentence. What is true after this lands that is not true now.

## Current state

Three to eight bullets, **each with a `file:line`**. What exists today, and what
about it makes the goal not yet true. A bullet with no `file:line` is a belief,
not a finding.

## Not doing

What a reader might reasonably expect here and will not get, and why. This is the
section that stops scope creep in the implement session.

## Tasks

### 1. <Task name>

- **Files** — create / modify / test, each named.
- **Steps** — what to do, in order.
- **Proof** — the command or the observation that shows it worked.

### 2. …

## Definition of Done

### Automated

- [ ] `<the exact command>` — <what passing it proves>
- [ ] `npm run guardrails` — the gate is green

### Manual

- [ ] <route> — <how to reach it, which seeded account, what to look for>

## Open questions / assumptions

- [ASSUMPTION] <what you assumed, and what breaks if it is wrong>
```

## The rules that make it usable

- **The checkboxes are the ledger.** `implement` ticks them here as it goes: a
  session can compact and the file cannot.
- **Automated boxes name a command.** "Tests pass" is not a box; the command that
  runs them is.
- **Manual boxes name a route.** Which URL, how to get there, which seeded
  account (`npm run db:seed:all`), and what a human should see.
- **No placeholders** — not "TBD", not "add appropriate error handling". An
  unknown is an `[ASSUMPTION]` the user can veto.
- **Cite rules, do not copy them.** `AGENTS.md`, `apps/api/AGENTS.md`,
  `apps/web/AGENTS.md`, `DESIGN.md`, `packages/schemas/AGENTS.md` already say it.
- **Size it to the diff.** Three files or fewer → about twenty lines.
