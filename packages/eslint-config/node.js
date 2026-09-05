import globals from "globals";
import nodePlugin from "eslint-plugin-n";
import { config as baseConfig } from "./base.js";

/**
 * For the workspaces that run on Node: api, mcp, extractor, training, schemas.
 *
 * `eslint-plugin-n` catches the Node-specific mistakes a type-checker does not:
 * importing a builtin that does not exist on the declared engine, a deprecated
 * API, a `require` in an ESM file. This repo is Node 22 ESM throughout, and the
 * engine is read from each workspace's own `package.json`.
 *
 * `n/no-missing-import` is OFF: it does not resolve TypeScript path aliases or
 * the `.js`-extension-on-`.ts`-source convention NodeNext requires, so it fires
 * on every correct import in the repo. `tsc` already proves imports resolve.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  nodePlugin.configs["flat/recommended-module"],
  {
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2023,
      sourceType: "module",
    },
    /**
     * Declared once here rather than per workspace. Without it the plugin
     * assumes a very old Node and reports 30 "unsupported feature" errors for
     * things this repo has used since day one — `node:` builtins, top-level
     * await, `structuredClone`. The repo is Node 22 (`.nvmrc`, the CI matrix,
     * and every Dockerfile agree).
     */
    settings: { n: { version: ">=22.0.0" } },
    rules: {
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",
      /**
       * OFF because it is wrong here. It reports the global `crypto` as
       * "experimental until Node 23"; `crypto.randomUUID()` has been stable
       * since Node 19 and works on the Node 22 this repo pins — verified by
       * running it. The rule's other checks are worth little once its loudest
       * one is a false positive, and `tsc` with @types/node covers the rest.
       */
      "n/no-unsupported-features/node-builtins": "off",
      /**
       * A `process.exit()` in a request path kills the server mid-response.
       * Legitimate in a CLI entry point, which is why the scripts and bin
       * globs turn it back off.
       */
      "n/no-process-exit": "error",
    },
  },
  {
    /**
     * THE LAYER RULE, AS A CHECK.
     *
     * `src/core/` is pure: entities, use cases, and the INTERFACES they depend
     * on. It must not know that Fastify, Drizzle, Redis or OpenAI exist. That
     * is what lets every use-case test run against in-memory repositories with
     * no database, no network and no container, in under a minute.
     *
     * It lives HERE, in the shared config, rather than in
     * `apps/api/eslint.config.js`, because it was already lost once: the
     * workspace configs were regenerated wholesale during the lint rollout and
     * this block went with them, silently, while the docs went on citing it as
     * the thing that found four violations. A rule in the shared base survives
     * a workspace config being rewritten, and
     * `scripts/guardrails/lint-sensors-self-test.mjs` proves it still fires.
     */
    files: ["**/src/core/**/*.ts"],
    ignores: ["**/src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/infra/**",
                "../infra/*",
                "../../infra/*",
                "../../../infra/*",
              ],
              message:
                "src/core/ must not import from src/infra/. Declare an interface in " +
                "src/core/providers/ or src/core/repositories/ and let src/infra/ implement it.",
            },
          ],
          paths: [
            {
              name: "fastify",
              message:
                "src/core/ is transport-agnostic. HTTP belongs in src/infra/http/.",
            },
            {
              name: "drizzle-orm",
              message:
                "src/core/ must not know the ORM. Depend on a repository interface; " +
                "src/infra/database/ implements it.",
            },
            {
              name: "ioredis",
              message:
                "src/core/ must not talk to Redis. Go through the queue provider interface.",
            },
            {
              name: "openai",
              message:
                "src/core/ must not call the OpenAI client. Use the provider interfaces in " +
                "src/core/providers/.",
            },
            {
              name: "pg",
              message:
                "src/core/ must not open a database connection. That is src/infra/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "**/bin/**",
      "**/scripts/**",
      "**/*.cli.ts",
      "**/run-*.ts",
      "**/main.ts",
      "**/index.ts",
      // Drizzle migration/seed CLIs: run standalone via `tsx`, never imported
      // into a request path. `migrate.ts` is `scripts/deploy.sh`'s pre-restart
      // step; `seed.ts` and `seed-realistic.ts` guard their `process.exit`
      // behind a `process.argv[1] === currentFile`/`main().catch` entry check
      // so importing their exported helpers (`seedDefaultCatalog`) elsewhere
      // never triggers it.
      "**/infra/database/drizzle/migrate.ts",
      "**/infra/database/drizzle/seed.ts",
      "**/infra/database/drizzle/seed-realistic.ts",
      // The Fastify process entry point: `process.exit(1)` on a failed boot,
      // `process.exit(0)` at the end of the SIGTERM/SIGINT graceful-shutdown
      // handler. Both run only outside `isTest()`, after the listening socket
      // and its dependents are already closed — never mid-request.
      "**/infra/http/server.ts",
      // `npx tsx .../backfill-search-index.ts <command>` — a standalone
      // search-index maintenance CLI (status/open-to-work/reembed). Moved on
      // 2026-09-05 from `src/core/use-case/resumes/maintenance/` to
      // `src/infra/database/drizzle/maintenance/`, where it sits beside the
      // other drizzle CLIs listed above. It had been in `core/` for proximity
      // to the search code it maintains, which cost four `no-restricted-imports`
      // violations; it has no importers and a `process.exit` entry point, so it
      // was a script, not a use case missing a repository interface.
      "**/maintenance/backfill-search-index.ts",
    ],
    rules: { "n/no-process-exit": "off" },
  },
  {
    /**
     * RULE EXCEPTION — `sonarjs/redundant-type-aliases`, one rule, one file.
     *
     * `export type TransactionContext = unknown;` is the NAMED OPAQUE HANDLE
     * for the single value that crosses the core/infra boundary: a use-case
     * receives one from `IUnitOfWork.runInTransaction` and threads it through
     * repository calls without ever being allowed to look inside it.
     *
     * WHY `unknown` AND NOT SOMETHING NARROWER. It is the only type that
     * accepts BOTH a real drizzle `PgTransaction` (from
     * `src/infra/database/drizzle/drizzle-unit-of-work.ts`) and `undefined`
     * (the no-transaction path) without a cast at the call site. Widening it to
     * a union of the two would drag `drizzle-orm` into `src/core/`, which the
     * layer rule above forbids for good reason.
     *
     * WHY NOT A BRANDED OPAQUE TYPE. It was implemented and rejected by tsc,
     * not by taste: TS2559 at `drizzle-unit-of-work.ts:17` — the weak-type
     * check, because a brand is by definition a property the real
     * `PgTransaction` object does not have — and TS2345 at
     * `in-memory-unit-of-work.ts:15`. Compilation wins over a lint rule.
     *
     * WHY NOT JUST INLINE `unknown`. 28 type positions across the 8 files that
     * import it (`grep -rn ': TransactionContext' apps/api/src`). Inlining
     * discards the name and the JSDoc above it, which is the only thing telling
     * a reader that the opaque value is a transaction handle rather than an
     * un-parsed payload — the exact thing this repo uses `unknown` for
     * everywhere else.
     *
     * Scoped to the one path. The rule stays ON for every other file in every
     * Node workspace, including the rest of `src/core/providers/`.
     */
    files: ["src/core/providers/unit-of-work/unit-of-work.ts"],
    rules: { "sonarjs/redundant-type-aliases": "off" },
  },
];
