// ESLint for apps/api — the largest codebase in the repo and, until this file
// existed, the only one that had never been linted at all.
//
// TWO DELIBERATE CHOICES, both of which will look wrong if you skim them:
//
// 1. THERE IS NO `lint` SCRIPT IN apps/api/package.json.
//    Adding one would put several hundred pre-existing findings into
//    `turbo run lint` and into the CI baseline in the same commit, and a gate
//    that is red on arrival is a gate people learn to bypass. Instead,
//    `scripts/guardrails/lint-changed.mjs` runs eslint here over the files a
//    change actually touched. New api code is linted from today; the backlog is
//    its own piece of work, on purpose, with its own review.
//    When the backlog is cleared, add `"lint": "eslint ."` and delete this note.
//
// 2. IT DOES NOT EXTEND `@repo/eslint-config`.
//    That shared base loads `eslint-plugin-only-warn`, which rewrites every
//    error to a warning. A config that cannot produce a non-zero exit code
//    cannot gate anything — it makes `eslint .` succeed on a file full of
//    violations. `packages/ui` (dead scaffolding) still uses it. Nothing that
//    is meant to block should.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "drizzle/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      // `_`-prefixed arguments are the codebase's existing convention for the
      // ones a signature requires but the body does not use (fastify handlers,
      // repository interface implementations).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // `any` erases the contract that @repo/schemas exists to enforce. Loud,
      // but not blocking on its own — the ratchet only fails on files you
      // touched, so this is a nudge on your own code rather than a wall.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // THE LAYER RULE, AS A CHECK.
    //
    // `src/core/` is pure: entities, use cases, and the INTERFACES they depend
    // on. It must not know that Fastify, Drizzle, Redis or OpenAI exist. That
    // is not architectural taste — it is what lets every use-case test run
    // against in-memory repositories with no database, no network and no
    // container, in under a minute.
    //
    // The violation is always accidental and always invisible: somebody needs
    // one type, imports it from `../../infra/...`, and the suite still passes
    // locally because that import happens to pull in something harmless today.
    // The cost arrives later, when the whole use-case suite needs a container.
    //
    // `apps/api` has no `lint` script (see the note at the top of this file),
    // so this fires through `scripts/guardrails/lint-changed.mjs` on the files
    // a change actually touches — which is exactly when it matters.
    files: ["src/core/**/*.ts"],
    ignores: ["src/core/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infra/**", "../infra/*", "../../infra/*", "../../../infra/*"],
              message:
                "src/core/ must not import from src/infra/. Declare an interface in " +
                "src/core/providers/ or src/core/repositories/ and let src/infra/ implement it.",
            },
          ],
          paths: [
            {
              name: "fastify",
              message: "src/core/ is transport-agnostic. HTTP belongs in src/infra/http/.",
            },
            {
              name: "drizzle-orm",
              message:
                "src/core/ must not know the ORM. Depend on a repository interface; " +
                "src/infra/database/ implements it.",
            },
            {
              name: "ioredis",
              message: "src/core/ must not talk to Redis. Go through the queue provider interface.",
            },
            {
              name: "openai",
              message:
                "src/core/ must not call the OpenAI client. Use the provider interfaces in " +
                "src/core/providers/ — that is also what keeps the cached embedding provider in play.",
            },
            {
              name: "pg",
              message: "src/core/ must not open a database connection. That is src/infra/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Test files legitimately reach for shapes the production code never has:
    // partial fakes, deliberately malformed payloads for a rejection path.
    files: ["**/*.test.ts", "**/test-support/**", "**/in-memory-*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
