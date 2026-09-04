# CraftHub — Agent Rules

A developer-profile platform. Developers import a resume, arrange a public
profile, recruiters search by job description (pgvector + an in-browser TF.js
re-rank shown as "AI Match %"), and coding agents publish posts through MCP
behind a per-user **disclosure policy**.

npm workspaces + Turborepo. Node 22. Ports: **api 3333**, **web 5173**.
`README.md` is the orientation doc; this file is the rules.

## The gate

```bash
node scripts/guardrails/pre-push.mjs      # or: npm run guardrails
```

One command. It builds `@repo/schemas`, type-checks and tests only what your
change affects, lints only the files you touched, checks the harness and the
locales, and prints `guardrails PASS` when it is green. The same script runs on
`git push` (husky) and on the Claude Code `Stop` hook — **you are not done
until it passes.**

If it fails, **fix the cause**. Do not reach for `--no-verify`, an inline
`eslint-disable`, a `.skip`, a type assertion, or a widened zod schema to get
past it. If you genuinely cannot fix it, say so plainly instead of hiding it.

The gate skips tests it cannot run (no docker → no Postgres-bound api tests; no
`OPENAI_API_KEY` → no live-embedding tests) and **says so by name**. A narrowed
run that announces what it narrowed is honest. Do not silence those notices.

## Non-negotiables

- **Contract first.** Every shape crossing a boundary lives in `@repo/schemas`.
  Change the schema first, `npm run build:schemas`, then the callers. Never
  define a boundary type locally to "unblock" yourself, and never widen a schema
  so a bad payload passes. `packages/schemas/AGENTS.md` says why the build order
  is not optional.
- **Type everything. Never `any`.** `unknown` + a zod parse is the honest form.
  `null` for an absent value that is modelled; `undefined` only for genuinely
  not-provided.
- **vitest, everywhere. Never jest.** Write a test whenever the work is a
  business rule, is reused, or can be expressed as one. Do not edit an existing
  test to make your change pass unless the user asked for a behaviour change
  that genuinely requires it — and check the blast radius first.
- **The four-state rule.** Every screen that reads from the network handles
  loading, empty, error and filled — all four. Only the filled state is an
  incomplete change; `apps/web/AGENTS.md` has the runner that proves it.
- **Server state is TanStack Query**, never `useEffect` + `fetch`. Client state
  is the single Zustand store. Forms are react-hook-form + a zod resolver.
- **File naming is kebab-case** everywhere.
- **Lint is not optional and not advisory.** Every workspace extends
  `@repo/eslint-config`; `npm run lint` is the syntactic layer and the
  type-aware rules run through a ratchet, so an inherited finding passes and one
  you add fails. Fix the cause — an inline `eslint-disable` is a workaround.
- **`DESIGN.md` is prescriptive**, and the surface constants are the card —
  never hand-write those class strings. Every colour utility needs a `dark:`
  counterpart. `apps/web/AGENTS.md` names the constants and the imports.
- **Every user-visible string in `apps/web` goes through `t()`**, added to all
  three locales in the same commit. The gate enforces both halves.
- **Known debt is recorded on purpose** in `docs/harness/known-debt.md`. Fixing
  one is its own task with its own review. Do not fix it as a side quest, and
  do not let it grow.

## MCP servers

| Server            | Use it for                                              | The rule that matters                                                                        |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **context7**      | library docs, before writing against any dependency     | this repo runs recent majors a model gets wrong from memory                                  |
| **postgres**      | proving a write landed, by a correlation id you control | read-only, local dev database only; "it returned 201" is not evidence                        |
| **postgres-prod** | the one production id you are investigating             | never browse a user table — every row you select leaves the building inside a context window |
| **grafana**       | evidence about the deployed app                         | read and query first; writing changes what on-call sees                                      |

Setup and the tunnel `postgres-prod` needs: `docs/mcp-servers.md`.

## Where the rest lives

| Topic                                            | File                            | Load it when                          |
| ------------------------------------------------ | ------------------------------- | ------------------------------------- |
| api: layers, DI, HTTP, database, queues, cost    | `apps/api/AGENTS.md`            | touching `apps/api`                   |
| web: routing, features, dark mode, design, forms | `apps/web/AGENTS.md`            | touching `apps/web`                   |
| the shared contract and its build order          | `packages/schemas/AGENTS.md`    | touching any boundary shape           |
| the visual contract                              | `DESIGN.md`                     | touching anything visible             |
| i18n: keys, plurals, enum leaves                 | the `i18n` skill                | adding or changing any string         |
| checking a change in a browser                   | the `visual-check` skill        | any visible change                    |
| how this harness is wired, and how to add to it  | `docs/harness/agent-harness.md` | adding a rule, a skill, or a tool     |
| the four hooks, and the two lint layers          | `docs/harness/agent-harness.md` | a hook fired and you want to know why |

## Output contract

Finish every task with a plain-language summary:

1. **What was done** — simple words, no jargon.
2. **Files changed, and why each one.**
3. **How to see it in the UI** — the exact route, how to navigate there, which
   filters or fixtures to use, and which seeded account
   (`bash db-manage.sh seed-all`) to sign in as.
4. **What you did not verify**, and why. This is not optional. A summary that
   omits the untested part is the most expensive kind of wrong.
