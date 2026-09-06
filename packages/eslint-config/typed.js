import tseslint from "typescript-eslint";

/**
 * THE TYPE-AWARE LAYER. Append this to a workspace's config, after the base.
 *
 * These are the rules that need the type-checker, and they are the only ones
 * that can answer "is this value actually typed?" — `no-unsafe-assignment`,
 * `no-unsafe-member-access`, `no-unsafe-return`, `no-floating-promises`,
 * `no-misused-promises`.
 *
 * WHY IT IS A SEPARATE EXPORT. It costs about five times the runtime: 40s for
 * `apps/api` against 8s syntactic. That is fine at push time and in CI, and far
 * too slow for a pre-commit hook, so the hooks pick a layer deliberately rather
 * than paying for the expensive one everywhere.
 *
 * WHY IT DID NOT ARRIVE AS A BIG BANG. Turning it on reported 788 existing
 * errors — 629 in `apps/api`, 159 in `apps/web`. Roughly a third of those are
 * async hygiene (`require-await`, `no-misused-promises`) and the rest are the
 * `no-unsafe-*` family. A gate that is red on arrival is a gate people learn to
 * bypass, so every one of them is recorded in
 * `scripts/guardrails/lint-baseline.json` and `lint-changed.mjs` blocks the
 * next one. New code is fully type-checked from today; the backlog is its own
 * task, with its own review.
 *
 * `projectService: true` lets typescript-eslint find each file's tsconfig
 * without a hand-maintained `project` array — the array form silently skips any
 * file no listed project includes, which reads as "clean".
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  {
    /**
     * Build and test config files are NOT type-aware linted, and that is a
     * decision rather than an oversight.
     *
     * They sit outside every tsconfig `include`, so the project service cannot
     * place them and every one fails to parse. Left alone, that failure was
     * recorded in `lint-baseline.json` as a `(fatal)` finding — indistinguishable
     * from real debt, and hiding the fact that six files were not being checked
     * at all. Ignoring them here is the honest version of the same outcome: they
     * are still fully covered by the syntactic config, which is what actually
     * matters for a 20-line config file.
     */
    ignores: [
      "**/*.config.ts",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/*.config.mts",
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      /**
       * Fires on any `async` function with no `await` in it. In this repo that
       * is overwhelmingly an interface implementation whose signature is async
       * because the interface is — a repository method that happens to be
       * synchronous in memory. Making those non-async would break the port.
       */
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/test-support/**",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
];
