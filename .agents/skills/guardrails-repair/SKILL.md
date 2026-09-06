---
name: guardrails-repair
description: "Repair a red gate at its cause. Use when `npm run guardrails` fails, when the husky pre-push or pre-commit hook blocks, or when the Claude Code Stop hook reports the tree is still red — it names the failing step, explains what that step actually proves, and fixes the cause. Also use when a failure looks like code but is environmental: an unbuilt @repo/schemas after a rebase, docker down, no OPENAI_API_KEY, or ports 3333/5173 owned by another project. Do NOT use for a failing test you are already mid-way through fixing, for CI-only failures on GitHub, or as a way to get past the gate — it never suppresses a signal."
---

# Guardrails repair — fix the cause, never the signal

One runner backs everything: `scripts/guardrails/pre-push.mjs`. It is what
`npm run guardrails`, the husky `pre-push` hook and the Claude Code `Stop` hook
all call. There are no modes and no `--only <step>` — the flags are
`--stop-hook`, `--base <ref>`, `--no-fetch` and `--skip-tests`.

Answer the user in their language; this file is English because everything under
`.agents/` is.

## 1. Read the failure before touching anything

Run the gate yourself and read the output whole:

```bash
npm run guardrails
```

Name the failing step out loud before you form a hypothesis. The runner prints
each step's name, and steps are sequential — the **first** red step is the one to
fix. Later steps did not run.

If the output says the loop guard tripped ("GUARDRAILS LOOP GUARD TRIPPED"), the
gate has blocked repeatedly and let a stop through so the session would not spin.
The tree is still red. Start at step 1 anyway.

## 2. The loop

Max **three** rounds: diagnose → smallest fix at the cause → re-run the gate.
Still red after three, stop and escalate with what you learned — the failing
step, what you ruled out, and what you would try next. A fourth round without a
new hypothesis is guessing.

## 3. Step → what it proves → the real fix

One row per name the runner prints, in the order it prints them.

| Step                                 | What it proves                                                                                                            | The real fix                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `build @repo/schemas`                | the shared contract compiles; everything downstream types against its `dist/`                                             | fix the schema. If it merely went stale after a pull or a rebase, `npm run build:schemas` is the whole fix                                  |
| `check-types (affected)`             | the workspaces your change reaches still type-check                                                                       | fix the type. Never `any`, never a cast to silence it, never a widened zod schema — `unknown` plus a parse is the honest form               |
| `lint (changed files, ratcheted)`    | your change added no new lint finding, against both the syntactic and typed layers                                        | fix the code. `npm run lint:fix` handles the autofixable half. An inherited finding already sits in `scripts/guardrails/lint-baseline.json` |
| `test — api`                         | the api suite passes (no `--coverage` here — see the note below)                                                          | fix the code, or the test if the behaviour genuinely changed and the user asked for it                                                      |
| `test — other workspaces (affected)` | web, schemas and the rest, scoped to what your change touched                                                             | same                                                                                                                                        |
| `harness (cites, budgets, skills)`   | every path cite and every npm-script cite in the harness resolves, files are inside budget, skills have valid frontmatter | make the cite true, or shrink the file. Over budget usually means depth belongs in `references/`, not that the number is wrong              |
| `design tokens (palette)`            | no `slate`/`gray`/`blue`/`indigo`, no arbitrary hex inside a Tailwind class                                               | use the tokens in `DESIGN.md`. The surface constants are the card; do not hand-write those class strings                                    |
| `i18n locale parity`                 | every key exists in all three locales                                                                                     | add the key to all three, in this commit                                                                                                    |
| `i18n raw strings`                   | the string became a key at all                                                                                            | wrap it in `t()` and add the key. The `i18n` skill is the contract                                                                          |

## 4. What runs outside this runner

Not gate steps. Do not go looking for them in the output above.

- **`pre-commit` (husky)** runs `scripts/guardrails/pre-commit.mjs` on staged
  files: prettier, then `eslint --fix`, then it re-stages what it touched and
  blocks on what is left. If a commit was refused, that is this hook, not the
  gate — and its findings are the syntactic layer only.
- **The api coverage ratchet** (`apps/api/vitest.config.ts`) is enforced by
  `npm run test:coverage` and CI, **never** by the gate. If you are here because
  coverage failed, you came from CI or from that command.
- **CI's lint job** counts findings against `LINT_ERROR_BASELINE` in
  `.github/workflows/ci.yml` and ratchets down. It is non-blocking there, but new
  code adds zero. Locally the runnable equivalent is `npm run lint:changed`.

## 5. Forbidden repairs

Each of these turns a red gate green while leaving the defect in place. Load the
`no-workarounds` skill if any of them starts to look reasonable.

- `any`, or a type assertion, to get past `check-types`.
- A widened zod schema so a bad payload parses. That is contract drift with a
  green light on it.
- An inline `eslint-disable`. The ratchet exists so you do not need one.
- `.skip` or `.only` on a test.
- `--no-verify`. There is no sanctioned exception. `.husky/pre-push` says it
  plainly: if a human uses it, they say so in the PR.
- Lowering a coverage threshold in `apps/api/vitest.config.ts`. It may only go up.
- Raising `LINT_ERROR_BASELINE`.
- Deleting or renaming a test so it stops running.

## 6. Failures that look like code and are not

Check these **before** editing a source file. Each has cost people hours.

- **Stale install or unbuilt schemas after a pull or a rebase.** Symptom: type
  errors in files you never touched, or missing exports from `@repo/schemas`.
  Fix: `npm ci` then `npm run build:schemas`, before touching code.
- **Docker down.** The Postgres-bound api tests need it:
  `bash db-manage.sh start` (on Windows: Git Bash or WSL) brings up Postgres,
  Redis and MinIO. The gate already skips those files by name when it cannot
  reach them — a run that announces what it narrowed is honest, so do not
  silence the notice.
- **No `OPENAI_API_KEY`.** The live-embedding tests skip by design, by name.
  That is not a failure.
- **Ports 3333 or 5173 owned by another project.** An eight-hour nightly run in
  this repo once produced zero signal because both ports belonged to a different
  app; every probe answered, and every answer was about someone else's code.
  Before believing any browser, e2e or API result, confirm the thing answering is
  **this** app — check the page title, or hit a route only CraftHub serves.
  `docs/nightly-loop.md` records how that one played out.

## 7. Report

Close with four lines, no more:

1. **What failed** — the step name, quoted from the runner.
2. **The cause** — not the symptom.
3. **What changed** — files, and why each.
4. **The green re-run** — the `npm run guardrails` line that now passes.

If you escalated instead, say so plainly and list what you ruled out. A red gate
reported honestly is cheaper than a green one that lied.
