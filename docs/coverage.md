# Coverage

```bash
npm run test:coverage          # every workspace that has tests
npm run test:coverage --workspace=web
```

Before this harness existed, `npm run test:coverage` **could not run at all** —
`@vitest/coverage-v8` was not installed anywhere and no workspace had coverage
configured. The numbers below are the first measurement this repo has ever had.

---

## Measured baseline

Taken with `@repo/schemas` built, docker up (Postgres + Redis), and the three
OpenAI-dependent api files excluded — the same scope CI runs.

| Workspace | Statements | Branches | Functions | Lines | Test files |
|---|---|---|---|---|---|
| `apps/api` | 55.31% | 89.36% | 67.79% | 55.31% | 101 (of 104) |
| `apps/web` | 57.34% | 77.86% | 60.12% | 57.34% | 47 |
| `apps/extractor` | 85.89% | 77.68% | 97.56% | 85.89% | 6 |
| `apps/training` | 99.01% | 86.54% | 100% | 98.96% | 9 |
| `packages/schemas` | 41.12% | 81.57% | 77.77% | 41.12% | 6 |
| `apps/mcp` | 95.56% | 99.2% | 100% | 95.56% | 7 |

## Floors currently enforced

| Workspace | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `apps/api` | 50 | 85 | 62 | 50 |
| `apps/web` | 55 | 75 | 57 | 55 |
| `apps/extractor` | 83 | 75 | 94 | 83 |
| `apps/training` | 95 | 84 | 98 | 95 |
| `packages/schemas` | 39 | 79 | 74 | 39 |
| `apps/mcp` | 92 | 96 | 97 | 92 |

**Target is 70 across the board.**

---

## Why a ratchet and not a threshold of 70

A hard 70 would fail on the first commit, in five workspaces at once, for code
nobody in that commit wrote. There are exactly three responses to that, and two
of them are bad: delete the check, or weaken it until it passes. This is the
third — run it, publish the number, and forbid it from going down.

The floors sit a few points below the measured baseline. That gap is not slack,
it absorbs two specific, legitimate causes of variance:

1. **The gate skips tests it cannot run.** No docker means three Postgres-bound
   api files do not execute, which lowers api coverage. A floor set exactly at
   the baseline would fail a push for a reason unrelated to the change.
2. Ordinary churn — adding a file with a couple of unhit error branches should
   prompt a test, not block a push at 09:00 on a Monday.

**Floors may only ever go UP.** When you raise coverage, raise the floor in the
same commit. That is the whole mechanism; without it the ratchet is just a
number in a config file.

---

## `apps/mcp` — from zero tests to a floor

It used to have none. It is a stdio MCP server and a thin HTTP client over the
api, and it is the surface through which **coding agents publish to a user's
public profile under a disclosure policy**. The blast radius of a bug there is
"an agent said something about an employer that the user forbade", which is the
worst failure this product has.

It now has 256 **characterization** tests across 7 files — they pin what the
code does today, so a later refactor that changes disclosure behaviour fails
loudly instead of silently. Nineteen of its twenty modules are at 100%.

Read the caveat in the next section before treating 95% as safety. These tests
were written by reading the implementation, which is exactly the way to write a
regression net and exactly the wrong way to discover that the implementation is
wrong in the first place. The disclosure rules in particular are pinned as
*observed*, not as *specified*.

The one uncovered module is `src/index.ts` (45 statements) — the stdio
bootstrap. Covering it means spawning the process and speaking the protocol over
a pipe, which belongs in an e2e, not in this suite. That is a deliberate gap,
written down rather than averaged away.

---

## What these numbers do not tell you

Coverage is a flashlight for finding code no test has ever executed. It is not
evidence of correctness. A React component rendered by a test that asserts
nothing is 100% covered. A zod schema imported by a test file is "covered"
without anyone ever having parsed a real payload through it.

The sensors that actually catch bugs in this repo:

- **`.parse()` real captured payloads through `@repo/schemas`.** Contract drift
  between api and web becomes a failing test instead of a runtime bug.
- **Four-state visual scenarios** (`npm run visual:run`). Loading, empty, error
  and filled, in both themes, with console errors and unexpected 4xx/5xx failing
  the run.
- **Correlation-id verification via the postgres MCP server.** After an action
  that should have written a row, query for it. A 201 is not proof.

Use coverage to decide *where to look*. Use those three to decide whether it works.
