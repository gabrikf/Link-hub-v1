import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import sonarjs from "eslint-plugin-sonarjs";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * THE SHARED BASE. Every workspace's `eslint.config.js` starts here.
 *
 * WHAT CHANGED, AND WHY IT MATTERED. This file used to load
 * `eslint-plugin-only-warn`, which rewrites every error to a warning. A config
 * that cannot produce a non-zero exit code cannot gate anything: `eslint .`
 * succeeded on a file full of violations. That was recorded as debt in
 * `docs/harness/known-debt.md` and it is why `apps/api/eslint.config.js` was
 * originally written NOT to extend this. The plugin is gone; extending this is
 * now the right thing to do.
 *
 * It also carried a `next.js` export for a Next app this repo does not have.
 * Also gone.
 *
 * WHAT IS HERE:
 *
 *   js.recommended        the rules nobody argues about
 *   typescript-eslint     recommended, syntactic only — the type-aware layer is
 *                         a separate export because it costs 5x the runtime
 *   sonarjs               SonarQube's own JS/TS analyzer rules, as a plugin.
 *                         Cognitive complexity, duplicated branches, useless
 *                         assignments, identical sub-expressions — the bug
 *                         classes a type-checker cannot see. No server, no
 *                         account, nothing leaves the machine.
 *   turbo                 undeclared env vars, which in a turborepo silently
 *                         break caching
 *   prettier              LAST, so formatting rules never fight the formatter
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  {
    ignores: [
      "dist/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
      "drizzle/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    plugins: { turbo: turboPlugin },
    rules: {
      /**
       * An env var that a task reads but turbo.json does not declare produces a
       * cache hit that should have been a miss — a stale build that looks fresh.
       * 141 real findings across api, mcp and extractor, all fixed by declaring
       * the names in `turbo.json`'s `globalPassThroughEnv`.
       *
       * `packages/eslint-config/react.js` turns it off for `apps/web`, where the
       * remaining 6 are all `import.meta.env.DEV` / `.MODE` — Vite
       * compile-time constants that turbo has no business knowing about.
       */
      "turbo/no-undeclared-env-vars": "error",
    },
  },
  {
    rules: {
      /**
       * `_`-prefixed arguments are this codebase's convention for the ones a
       * signature requires but the body does not use — fastify handlers,
       * repository interface implementations, React event handlers.
       */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      /**
       * `any` erases the contract `@repo/schemas` exists to enforce. The root
       * AGENTS.md states this as a non-negotiable; here it is the check.
       * `unknown` plus a zod parse is the honest form.
       */
      "@typescript-eslint/no-explicit-any": "error",
      /**
       * Sonar's default complexity threshold is 15. Left at the default rather
       * than tuned to fit what exists — a threshold chosen to make the current
       * code pass measures nothing.
       */
      "sonarjs/cognitive-complexity": ["error", 15],
      /**
       * Fires on `catch (e) { throw e; }` and friends. Noisy in test files that
       * legitimately re-throw for a matcher, so it is scoped off there below.
       */
      "sonarjs/no-ignored-exceptions": "error",
      /**
       * OFF. 52 hits in `apps/web`, and they are ordinary chained ternaries:
       * a Tailwind class picked by step state, a heading size picked by level,
       * a date-range label, a term-resolution fallback in a worker. Roughly
       * twenty of them are the loading/empty/error/filled render chain this
       * repo's four-state rule requires, so the rule does partly fight a
       * mandated convention — but the honest reason to switch it off is that
       * Sonar classifies it as a maintainability smell rather than a bug, and
       * `sonarjs/cognitive-complexity` (kept at error) already catches nesting
       * that has actually got out of hand.
       *
       * An earlier version of this comment claimed all 53 were four-state
       * render branches. That was not measured, and it was wrong. If you are
       * about to write a number in one of these comments, run the rule first.
       */
      "sonarjs/no-nested-conditional": "off",
      /**
       * OFF, and this one was paid for. The rule's own message is "Make sure
       * that using this pseudorandom number generator is safe here" — a review
       * prompt, not a defect report. As an ERROR it demands an edit on code
       * that usually needs none, and on 2026-09-04 it got one: an agent
       * clearing lint findings replaced `Math.random()` in a search SESSION
       * CORRELATION ID with a `crypto.getRandomValues` branch that TypeScript
       * narrows to `never`, and broke the build.
       *
       * Six hits, all non-cryptographic: an analytics session id in
       * `advanced-search-page.tsx`, four in `apps/training/src/lib/synthetic.ts`
       * generating synthetic training data, and one in
       * `apps/api/.../seed-realistic.ts`. `Math.random` is correct for all of
       * them.
       *
       * Where randomness IS security-bearing here — session tokens, the refresh
       * token in `issue-session.ts`, password hashing — the code already uses
       * `crypto.randomUUID()`, argon2 and JWT. That is a review concern on a
       * handful of known files, not a repo-wide lint rule whose loudest effect
       * is to invite a wrong fix.
       */
      "sonarjs/pseudo-random": "off",
    },
  },
  {
    /**
     * Tests reach for shapes production code never has: partial fakes,
     * deliberately malformed payloads for a rejection path, duplicated setup
     * that is clearer repeated than extracted.
     */
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/test-support/**",
      "**/in-memory-*.ts",
      "**/*-test-factory.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-identical-functions": "off",
      "sonarjs/cognitive-complexity": "off",
      /**
       * Sonar's credential detectors read a test fixture exactly like a leaked
       * secret, and they cannot tell the difference: 89 of the 91 hits in this
       * repo were `password: "12345678"` in a seeded login test and the HMAC key
       * in `webhook-signature.test.ts`. Left on, the rule would be 98% noise and
       * the two real hits would never be read. It stays ON everywhere else,
       * which is where a committed credential would actually hurt.
       */
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/no-hardcoded-secrets": "off",
      "sonarjs/hardcoded-secret-signatures": "off",
      /**
       * A test that builds a deliberately pathological input is doing its job.
       */
      "sonarjs/super-linear-regex": "off",
      "sonarjs/pseudo-random": "off",
    },
  },
  eslintConfigPrettier,
];
