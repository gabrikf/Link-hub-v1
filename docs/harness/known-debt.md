# Known debt

Every item here is recorded on purpose. Fixing one is its own task, with its
own review. **Do not fix one as a side quest, and do not let it grow.**

Last verified against the tree: 2026-09-05.

| Debt                                                | Where it bites | Status                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~A backlog of eslint errors~~                      | —              | **CLEARED 2026-09-05: 67 → 0.** `npm run lint` exits 0 across all seven workspaces and the CI job now BLOCKS (`continue-on-error` and the ratchet were removed). Two of the 67 are green by a documented rule exception rather than a fix — see the Retired section |
| ~~Type-aware findings across all seven workspaces~~ | —              | **CLEARED 2026-09-05: 555 → 0.** `scripts/guardrails/lint-baseline.json` records zero findings; the ratchet now blocks the FIRST one                                                                                                                                |

## Detail

### The eslint backlog — cleared

**0 errors on 2026-09-05.** `npm run lint` exits 0 across all seven workspaces,
and `.github/workflows/ci.yml`'s lint job now blocks: `continue-on-error` and
the `LINT_ERROR_BASELINE` ratchet were removed, which is what the previous
version of that comment said to do at zero.

It was 67 on 2026-09-04. Nothing was silenced to get here — the sweep's diff
adds zero `eslint-disable`, zero `@ts-expect-error`, zero `: any`, zero `.skip`.

**Two of the 67 are green by exception, not by fix.** Both are scoped to one
file and one rule in `packages/eslint-config`, both carry their evidence in a
comment beside them, and the blast radius of each was proven with an interleaved
toggle sweep (lint with and without the block, back to back, per workspace, in
both the syntactic and typed configs) showing exactly one finding removed:

- `sonarjs/redundant-type-aliases` on
  `apps/api/src/core/providers/unit-of-work/unit-of-work.ts`
  (`packages/eslint-config/node.js`). `export type TransactionContext = unknown;`
  is the named opaque handle for the one value crossing the core/infra boundary.
  `unknown` is the only type accepting both a real drizzle `PgTransaction` and
  `undefined` without a cast. A branded opaque type was **implemented and run
  against tsc**, not merely considered, and rejected: TS2559 at
  `drizzle-unit-of-work.ts:17` (weak-type check — a brand is by definition a
  property the real object lacks) and TS2345 at `in-memory-unit-of-work.ts:15`.
  Inlining `unknown` at its 28 type positions across 8 files would discard the
  name and its JSDoc. The rule still fires on the sibling
  `in-memory-unit-of-work.ts`, on `infra/http/server.ts`, and across mcp,
  extractor, training and schemas.
- `sonarjs/deprecation` on `apps/web/src/features/settings/lib/use-clipboard.ts`
  (`packages/eslint-config/react.js`). `document.execCommand("copy")` IS the
  fallback for contexts without the async Clipboard API, on the path that copies
  personal access tokens. The only non-deprecated API is `navigator.clipboard`,
  which is already the primary three lines above — so "fixing" it deletes a
  working fallback. **This exception is expected to be permanent.** The rule
  still fires on the sibling `settings/lib/mcp-config.ts`, on
  `lib/token-queries.ts`, and in `apps/mcp`. (It also fired in
  `packages/ui` when that exception was written; that workspace was deleted the
  same day.)

If either file changes such that the exception is no longer warranted, delete
the block rather than letting it sit.

### The type-aware backlog — cleared

**0 recorded findings** in `scripts/guardrails/lint-baseline.json` on
2026-09-05, down from 555 across 208 files the day before. The ratchet now
blocks the FIRST new finding rather than the 556th.

They are recorded per file and rule, so `lint-changed.mjs` passes an inherited
finding and fails a new one. New code is fully type-checked from 2026-09-04.
The backlog was cleared on 2026-09-05 — that task is done; what is left is the
list above, each item declined for a stated reason rather than outstanding.

## Retired — items that were here and are no longer true

- **"`packages/ui` is dead scaffolding — no workspace imports `@repo/ui`."**
  Retired 2026-09-05 — **workspace deleted.** Verified dead first: no workspace
  `package.json` declared it, no source import, no tsconfig reference, no eslint
  reference; `npm ls @repo/ui` showed it linked from the root only.
  Four references were NOT dead and were fixed alongside it — the `Dockerfile`
  (two `COPY packages/ui/package.json` lines, load-bearing: leaving them would
  have failed the image build), `.dockerignore`, `lint-file-hook.mjs`'s
  `LINTABLE_WORKSPACES`, and the `README` table — plus eleven harness cites,
  seven of which `npm run harness:check` caught, which is that check doing its
  job.
  **The runtime argument was weak and is worth recording honestly:** both of its
  tasks ran fully parallel off the critical path, so on a 12-core box the saving
  was ~1.1s of CPU contention, and on a 2-core CI runner it may vanish. It was
  deleted for the second-order cost — it was a decoy destination the harness
  spent words steering agents away from (`no-workarounds` said "do not revive it
  as the destination"), and every skill's debt list had to name it.
  Lost: three `create-turbo` starter components and a `generate:component`
  script pointing at a `turbo gen react-component` generator that does not exist
  in this repo. Shared UI already lives in `apps/web/src/shared-components/`.

- **`turbo.json`'s `lint` task no longer declares `dependsOn: ["^lint"]`.**
  Changed 2026-09-05. `--dry-run=json` showed the only real edge was
  `@repo/schemas#lint` gating all five apps (the two config packages have no
  lint script), and `--summarize` priced it exactly: schemas finished at
  t+3058ms and every app started at t+3126ms. No eslint config imports built
  output, so the edge was not load-bearing. Measured over 7 samples per config:
  **25.29s → 21.33s median, −15.7%**. Deleting `packages/ui` took it to 20.22s
  (−20.0% combined).
  Note this does NOT speed up `npm run guardrails`: the gate's dominant step is
  `lint-changed.mjs`, which runs eslint directly rather than through turbo.

- **"`apps/web` does not check indexed access."** Retired 2026-09-05, hours after
  it was recorded — **108 errors across 21 files → 0**, zero non-null assertions
  added. All seven workspaces now have `noUncheckedIndexedAccess`.
  Only 21 of the 108 were production source; the rest were tests.
  **It found a second real bug.** `profile-layout-page.tsx` `moveTab` did
  `const index = ids.indexOf(tabId)` and bounds-checked `index + direction`.
  `indexOf` returns `-1` for a tab no longer in the list, so with
  `direction: 1` the target is `0` and the bounds check PASSES — the swap then
  wrote `ids[0] = undefined` and shipped an id list containing `undefined` to
  the reorder mutation. Reachable by clicking a tab that was just optimistically
  deleted. Guarded now, though **without a regression test**: `moveTab` is a
  closure inside a 1300-line component with no seam to call it with a stale id.
  Same file also carried a comment claiming a `=== null` branch was dead "because
  this workspace lacks the flag" — the branch is real, and the comment is fixed.
  **Still open, deliberately:** `apps/web/tsconfig.node.json` (scope:
  `vite.config.ts` only) does not set the flag. Measured out-of-band at **0
  errors**, so enabling it is a free one-liner nobody has done.

- **"A stray `pluguins/` directory (typo for `plugins`)."** Retired 2026-09-05.
  It really was the one-file, one-importer case this entry described:
  `git mv` to `apps/api/src/infra/http/plugins/database.ts` (beside the
  `http-observability.ts` that was already there, which is why `server.ts`
  already imported `./plugins/...` for its neighbour) plus one import specifier.
  No tsconfig, eslint, Dockerfile or turbo glob named the path — those use the
  generic `src/**/*`. Verified after: zero occurrences of `pluguins` anywhere
  under `apps/api/src`, `npm run build --workspace=api` emits
  `dist/infra/http/plugins/database.js`, and the api suite is unchanged at
  145 files / 1368 tests.
  Remaining mentions of the old spelling are deliberate and should stay: the
  historical eval records in `docs/harness/eval-log.md` and
  `claim-ledger-baseline.json`, and the example in
  `docs/qa/templates/charter.md`. Rewriting those would be editing history.

- **"`apps/api` and `apps/training` do not extend `@repo/typescript-config` —
  they miss `noUncheckedIndexedAccess`."** Retired 2026-09-05 — **396 errors
  fixed, 0 remaining** (api 335 across 82 files, training 61 across 5).
  The flag was added DIRECTLY rather than by extending the base, and the
  difference was measured, not assumed: extending produces the identical 335
  type errors, but the base also turns on `declaration`, `declarationMap`,
  `isolatedModules`, `resolveJsonModule`, `moduleDetection: force` and
  `target: ES2022` — and since `apps/api/tsconfig.build.json` extends the same
  config to emit `dist/`, that would have silently moved the shipped JavaScript
  target from es2020 to ES2022 and started emitting `.d.ts` for two applications
  nobody consumes as libraries.
  **Zero non-null assertions were added** — the whole point of the flag is to
  surface reads that can be `undefined`, and `!` asserts they cannot. The fixes
  are real narrowings, `for (const [i, x] of arr.entries())` rebinds, and two new
  shared helpers (`requireReturnedRow` for Drizzle `.returning()` rows,
  `expectDefined` for tests).
  **It found a real latent bug on the way:** `resume.repository.ts`
  `upsertByUserId` passed the result of an UPDATE straight to `toEntity`. An
  UPDATE whose WHERE matches nothing returns `[]`, so a resume deleted between
  the read and the write produced `TypeError: Cannot read properties of
undefined` from inside the mapper — a 500 naming neither the statement nor the
  row. It now throws a named error. It was the only one of 19 `.returning()`
  sites missing the guard its two neighbours already had.

- **"The gate's infra probes identify a PORT, not a service."** Retired
  2026-09-05 — **fixed for Postgres and Redis, the two that were still open.**
  MinIO had been fixed on 2026-09-04 by asking for the bucket `minio-setup`
  creates; the other two now ask a question the port cannot answer:
  - **Postgres** connects with the credentials the api tests themselves use
    (`process.env` then `apps/api/.env`, the same order `dotenv` gives
    `test-setup.ts`) and requires both `current_database()` to be the database
    `DATABASE_URL` names and `to_regclass('public.profile_blocks')` to be
    non-null. Verified in both directions against a real second Postgres
    container on another port: our own server answers yes; a foreign server
    answers no, and so does our own server addressed as the built-in `postgres`
    database, a database that does not exist, or with credentials that do not
    work. **It degrades rather than false-negativing:** an absent or unparseable
    `DATABASE_URL`, or an unresolvable driver, is UNDECIDABLE and falls back to
    the old port-only answer, so the probe can only ever turn a "yes" into a
    "no" on evidence. ~65ms → ~270ms, against a 90-second gate budget. The URL
    reaches the probe through the child's environment, never argv, and the
    child's output is discarded.
  - **Redis** had no probe at all, which was worse than the row implied:
    `bullmq-resume-embedding-queue.test.ts` and
    `bullmq-activity-digest-queue.test.ts` open a real ioredis connection with
    `maxRetriesPerRequest: null`, so with no Redis they retry to vitest's
    60-second timeout instead of failing. They are now a `NEEDS_REDIS` group,
    and the probe speaks the protocol: `PING`, and only `+PONG` counts (~25ms).
    A non-Redis on 6379 fails it, so does an instance that requires a password
    `REDIS_URL` does not carry, and so does one that accepts the connection and
    never answers. **The claim it makes is deliberately weaker than the other
    two, and the comment says so:** a foreign Redis passes, because Redis has no
    per-project namespace to ask about and both tests already scope their queue
    to `${process.pid}` and obliterate only that — so a stranger's instance can
    neither corrupt them nor be corrupted by them. Mailpit stays port-only on
    purpose, for the reason written beside it.

- **"The `visual-check` skill's `setTheme()` does not work for an authed
  account."** Retired 2026-09-05 — **fixed in the runner, not documented
  around.** `setTheme` in `scripts/visual/run.mjs` now does both halves: it
  seeds `localStorage["crafthub-theme"]` for the first paint AND rewrites
  `GET /preferences` so `app-boot.ts`'s `applyThemePreference` bootstrap — the
  step that used to overwrite the seed — applies the same value. It is a rewrite
  of the server's answer, not a forced `.dark` class, so the app's own code path
  is still what paints.

  **And it can no longer lie.** It polls the rendered page and holds for a
  settle window (boot applies the server value _after_ `load`), then throws with
  the painted theme, the `colorScheme` and the computed background if that is
  not what was asked for. Proven on the signed-in dashboard of an account whose
  stored preference is `light`: the old mechanism alone returned
  `class=(none) colorScheme=light body rgb(244, 244, 245)` for a request for
  dark, and the fixed helper returns `class=dark colorScheme=dark body
rgb(9, 9, 11)` — screenshots in `.visual/theme-authed-proof-*.png`.

  The seed-only behaviour survives as `seedStoredTheme(preference)`, which makes
  no claim about what paints, because one check genuinely wants it:
  `app-boot.scenario.mjs` leaves a stale mirror on purpose and asserts the
  database wins. `SKILL.md` §3 and both references were rewritten to match, and
  the two-argument `setTheme(page, theme)` they documented — which was never the
  runner's signature — is gone.

- **"Four files in `apps/api/src/core/` import from `src/infra/` (seven
  violations)."** Retired 2026-09-05 — **fixed, not reclassified.** All seven are
  gone and `npx eslint 'src/core/**/*.ts'` reports zero `no-restricted-imports`:
  - `AiQuotaOperation` moved from `infra/config/app-config.ts` into the core port
    `core/providers/ai-quota/ai-quota-provider.ts`, re-exported from app-config so
    consumers kept working. Zero runtime change, proven by emitting with
    `tsc -p tsconfig.build.json` and confirming the emitted `app-config.js`
    contains no import of core.
  - `backfill-search-index.ts` (four of the seven) relocated to
    `infra/database/drizzle/maintenance/`. The open question in this file — "a use
    case missing its repository interface, or a script that belongs in infra?" —
    resolved as **a script**: zero importers anywhere, `dotenv/config`, a
    `process.exit` CLI entry point, 0% coverage. Moved with `git mv`, no logic
    change; the `n/no-process-exit` allowlist glob still matches, confirmed with
    `eslint --print-config`.
  - `DeterministicEmbeddingProvider` moved to `core/providers/embedding/` beside
    the `IEmbeddingProvider` port it implements, following the existing
    `core/providers/` convention. **Note for reviewers:** `container.ts` registers
    it as the production fallback when `OPENAI_API_KEY` is absent, so it is a real
    adapter, not a test double. It qualifies because it is pure (FNV-1a hashing,
    no I/O, no SDK) — that purity is the load-bearing premise and is documented in
    the file itself.

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
