# Known debt

Every item here is recorded on purpose. Fixing one is its own task, with its
own review. **Do not fix one as a side quest, and do not let it grow.**

Last verified against the tree: 2026-09-04.

| Debt                                                                   | Where it bites                                 | Status                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A backlog of eslint errors in `apps/web` (29 on 2026-09-04)            | `npm run lint`                                 | counted, printed and ratcheted every CI run by `LINT_ERROR_BASELINE` in `.github/workflows/ci.yml`                                                                                                  |
| Type-aware findings across `apps/api` and `apps/web`                   | new code only                                  | 788 recorded in `scripts/guardrails/lint-baseline.json`; the ratchet blocks the 789th                                                                                                               |
| `packages/ui` is dead scaffolding                                      | nothing                                        | no workspace imports `@repo/ui`                                                                                                                                                                     |
| `apps/api` and `apps/training` do not extend `@repo/typescript-config` | those two workspaces                           | they miss `noUncheckedIndexedAccess`                                                                                                                                                                |
| A stray `pluguins/` directory (typo for `plugins`)                     | `apps/api/src/infra/http/pluguins/database.ts` | one file, imported under that name; renaming it is a one-line import change plus a build check, and nobody has wanted it enough                                                                     |
| The gate's infra probes identify a PORT, not a service                 | `pre-push.mjs`                                 | fixed for MinIO on 2026-09-04 after a foreign instance on 9000 made the gate fail on someone else's credentials; Postgres (5432) and Redis still probe the port alone and have the same latent flaw |
| Four files in `apps/api/src/core/` import from `src/infra/`            | the layer rule                                 | found by the new eslint sensor on 2026-09-04; the gate lints only changed files, so it blocks new violations and does not block today                                                               |

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

### The type-aware backlog

Turning on `no-unsafe-assignment`, `no-unsafe-member-access`,
`no-floating-promises` and `no-misused-promises` reported **788 existing
errors** — 629 in `apps/api`, 159 in `apps/web`. Roughly a third are async
hygiene and the rest are the `no-unsafe-*` family, which is what "a value flowed
in here without a type" looks like.

They are recorded per file and rule, so `lint-changed.mjs` passes an inherited
finding and fails a new one. New code is fully type-checked from 2026-09-04.
Clearing the backlog is its own task: most of it is in request handlers and
queue payloads, and every fix is a real change to how a value is validated.

## Retired — items that were here and are no longer true

- **"`apps/api` has no lint history / deliberately has no `lint` script."**
  Retired 2026-09-04: every workspace has a `lint` script and extends
  `@repo/eslint-config`. The reason it did not — the shared base loaded
  `eslint-plugin-only-warn` — is itself retired below. The measured backlog was
  14 errors, not the "several hundred" the old config comment feared.
- **"`packages/eslint-config` uses `eslint-plugin-only-warn`."** Retired
  2026-09-04: the plugin is uninstalled. It rewrote every error to a warning, so
  a config extending that base could not fail a build, which is why `apps/api`
  was originally written not to extend it.

Kept so nobody re-adds them from memory or from an old branch.

- **"`apps/mcp` has zero tests, coverage floor 0."** Retired 2026-09-04:
  `apps/mcp` has seven test files and `apps/mcp/vitest.config.ts` sets
  thresholds of 92 statements / 96 branches / 97 functions / 92 lines.
- ~~**"There is a stray `pluguins/` directory (typo). Leave it."**~~ **Retired
  in error on 2026-09-04 and reinstated the same day** — see the table above.
  The directory is real; the check that "retired" it was
  `find . -maxdepth 3 -name pluguins`, which never reaches
  `apps/api/src/infra/http/pluguins/` at depth 5. Two eval judges disagreed
  about this and the wrong one was believed because it matched a bad command.
  Recorded rather than quietly deleted: this entry is the evidence that
  "verified" means nothing without saying _how_.
