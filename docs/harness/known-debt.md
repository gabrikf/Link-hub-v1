# Known debt

Every item here is recorded on purpose. Fixing one is its own task, with its
own review. **Do not fix one as a side quest, and do not let it grow.**

Last verified against the tree: 2026-09-04.

| Debt | Where it bites | Status |
|---|---|---|
| A backlog of eslint errors in `apps/web` (29 on 2026-09-04) | `npm run lint` | counted, printed and ratcheted every CI run by `LINT_ERROR_BASELINE` in `.github/workflows/ci.yml` |
| `apps/api` has no lint history | new api code only | `apps/api/eslint.config.js` exists; the workspace deliberately has no `lint` script |
| `packages/eslint-config` uses `eslint-plugin-only-warn` | anything extending it | it rewrites every error to a warning, so nothing meant to block may extend that base |
| `packages/ui` is dead scaffolding | nothing | no workspace imports `@repo/ui` |
| `apps/api` and `apps/training` do not extend `@repo/typescript-config` | those two workspaces | they miss `noUncheckedIndexedAccess` |
| Four files in `apps/api/src/core/` import from `src/infra/` | the layer rule | found by the new eslint sensor on 2026-09-04; the gate lints only changed files, so it blocks new violations and does not block today |

### The four `src/core` layer violations

Seven violations across four files, found the moment the layer rule became a
check rather than a sentence. Re-derive the list any time with
`npx eslint 'src/core/**/*.ts'` from `apps/api` — do not trust this copy over
the tool:

- `src/core/providers/ai-quota/ai-quota-provider.ts` → `infra/config/app-config.js`
- `src/core/providers/ai-quota/in-memory-ai-quota-provider.ts` → the same
- `src/core/use-case/resumes/maintenance/backfill-search-index.ts` → `drizzle-orm`,
  the drizzle client, the schema, and the BullMQ queue directly (four of the seven)
- `src/core/use-case/resumes/search-testing/search-corpus.ts` → a concrete
  embedding provider

`backfill-search-index.ts` is the interesting one: a maintenance script living
in `core/` that talks to the database directly, so it is either a use case
missing its repository interface or a script that belongs in `infra/`. Deciding
which is its own task.

## Detail

### The eslint backlog in `apps/web`

Mostly `react-hooks/set-state-in-effect` (new in eslint-plugin-react-hooks v7)
and `react-refresh/only-export-components`. The CI job runs eslint, prints the
count, and fails the moment it exceeds the baseline. It does not block the merge
queue while the debt is being paid.

The count itself lives in one place — `LINT_ERROR_BASELINE` — precisely so it
cannot drift. It was written as 30 and stood at 29 on 2026-09-04; the ratchet
was lowered to match, which is the only direction it may move.

The gate lints only the files **you** changed. If a rule fires on your code,
fix the code — an inline `eslint-disable` to clear the ratchet is a workaround,
not a fix. When the count reaches 0, drop `continue-on-error` and the ratchet
from the workflow and let `npm run lint` fail the job outright.

### `apps/api` has no `lint` script

Read the comment at the top of `apps/api/eslint.config.js` for why. New api
code is held to that config from today, through
`node scripts/guardrails/lint-changed.mjs`, which the gate runs. The historical
backlog is a separate task.

### `eslint-plugin-only-warn` in the shared base

It rewrites every error to a warning, which neuters any gate that consumes it.
This is why `lint-changed.mjs` counts and compares rather than trusting an exit
code, and why a new blocking check must not extend that base.

## Retired — items that were here and are no longer true

Kept so nobody re-adds them from memory or from an old branch.

- **"`apps/mcp` has zero tests, coverage floor 0."** Retired 2026-09-04:
  `apps/mcp` has seven test files and `apps/mcp/vitest.config.ts` sets
  thresholds of 92 statements / 96 branches / 97 functions / 92 lines.
- **"There is a stray `pluguins/` directory (typo). Leave it."** Retired
  2026-09-04: the directory does not exist in the tree.
