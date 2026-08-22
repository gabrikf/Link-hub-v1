# Automation Backlog

Automation intent lives in **one place** — `<qa-docs-path>/automation-backlog/`, one file per item — never as metadata attached to scenarios or charters. "Should this become an automated walk?" is an engineering-planning question; asking it on every session note drags the planner back into coverage-matrix thinking.

## Contents

- What belongs here
- The layers available in this repo
- Entry format
- When to add an entry
- Lifecycle
- Anti-patterns

## What belongs here

- Journeys stable and valuable enough to deserve an automated walk.
- Regression-prone scenarios (repeat offenders in the bug registry) worth pinning.
- Fix-verification replays that had no meaningful automated test at fix time (per the `qa-execution` skill's fix-loop governor) and should eventually get one.
- A bug class that keeps recurring across cycles and is cheaper to pin with a sensor than to re-walk — the `dark-mode` and `api-contract` root causes are the two that usually earn this here.

## The layers available in this repo

Pick the cheapest layer that would actually have caught the bug:

| Layer | What it is | Best for |
|---|---|---|
| **Contract test** | `.parse()` a **real captured payload** through its `@repo/schemas` zod schema | Anything that failed because a response shape drifted. The strongest sensor in this repo, and usually the cheapest. |
| **Unit / component (vitest)** | vitest everywhere; `@testing-library/react` + jsdom on the web side, node env on the API side | A single component's or use case's behavior |
| **API route test** | `apps/api/src/infra/http/test-support/build-test-app.ts` — in-memory repositories + `server.inject`, no socket, no database | A route's behavior end to end without infrastructure |
| **Visual scenario** | `scripts/visual/scenarios/<name>.scenario.mjs`, run by `node scripts/visual/run.mjs <file>` | A walked journey: one browser launch across loading / empty / error / filled, failing on console errors and un-mocked 4xx/5xx. The right home for a theme sweep. |
| **Coverage ratchet** | `npm run test:coverage`, per-package floors that may only go up | A flashlight on untested surface — never a correctness claim on its own |

Two constraints to record in any entry that needs them: `npm run build:schemas` must run before anything type-checks, and three API test files need the docker stack up (and, for two of them, a funded `OPENAI_API_KEY`) — so a suggested layer that lands in those files is more expensive than it looks.

## Entry format

One file per item at `<qa-docs-path>/automation-backlog/<slug>.md` — the slug is the content-addressed id (2-5 kebab-case words naming the journey or scenario to pin), so parallel branches recording the same intent mint the same file and the add/add conflict is the dedup:

```markdown
# <journey or scenario title>
- Source: <J-<slug> / scenario ids / bug id that motivated this>
- Why automate: <regression-prone | high-value stable journey | fix lacked a test | recurring root cause>
- Suggested layer: <contract test | unit/component (vitest) | API route test | visual scenario | coverage floor>
- Infra needed: <none | docker stack | OPENAI_API_KEY | none but build:schemas first>
- Spec sketch: <2-4 lines: entry, key assertions incl. the true end state; themes if visual>
- Status: proposed | accepted | implemented (<test path>) | rejected (<reason>)
```

## When to add an entry

- A scenario fails the same way twice across cycles (check the bug's `Re-found`/`Regressed` sections).
- A journey reaches `pass` for three consecutive cycles and is P0 — stable enough to pin, valuable enough to matter.
- A fix shipped with a documented replay instead of a regression test — the entry records the debt.
- A cycle's Root Cause totals concentrate on one value; the entry proposes the sensor that would have caught that class.

**What does not go here:** the known, deliberate debt. Zero tests in `apps/mcp`, the 30 eslint errors in `apps/web`, `packages/ui` being dead, `eslint-plugin-only-warn` neutering the shared config. Those are decisions already made, and re-proposing them every cycle is noise. If a QA cycle produces evidence that one of them is now costing real bugs, that is a Decision for a Human in the report — not a backlog entry filed quietly.

## Lifecycle

1. Planner or executor adds entries (dedup by slug and `Source` first — update the existing file rather than wording a sibling).
2. Engineering triages: `accepted` or `rejected` with reasoning, recorded in the entry's `Status`.
3. When implemented, record the test path and flip to `implemented` — the scenario's future cycles can then downgrade to smoke cadence.

## Anti-patterns

- **Automation fields on scenarios/charters** — `automation_target`, `automation_status` per artifact is the old model; it pulls every planning conversation into tooling. (It is also why the scenario schema is closed at 16 fields.)
- **Backlog as a dumping ground** — an entry without a motivating source (journey, bug, fix, root-cause pattern) is noise.
- **One shared backlog file** — a single `automation-backlog.md` every run appends to is a merge magnet; one file per item keeps additions conflict-free.
- **Reaching for the browser first** — a visual scenario is the most expensive layer to write and maintain. If a contract test would have caught the same drift, that is the entry.
- **Automating instead of walking** — an implemented scenario covers regressions of a known path; it never replaces persona sessions for new or changed surfaces, and it will never notice that the AI Match % means nothing to a recruiter.
- **Re-proposing the known debt** — see above.
