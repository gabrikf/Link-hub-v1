import { config } from "@repo/eslint-config/node";
import { config as typed } from "@repo/eslint-config/typed";

/**
 * Syntactic + type-aware, for `scripts/guardrails/lint-changed.mjs`.
 *
 * Deliberately not the config `npm run lint` uses. Run repo-wide these rules
 * report the whole recorded backlog, and a gate that is red on arrival is a
 * gate people learn to bypass. The ratchet compares per file and rule instead,
 * so a finding you introduce fails and one you inherited does not.
 */
export default [
  ...config,
  ...typed,
  {
    /**
     * `tsconfig.json` here excludes test files so they are never emitted into
     * `dist`. That left the project service unable to place them, so the
     * type-aware rules failed to parse all 12 and reported `(fatal)` — which
     * the ratchet then recorded as if it were debt. `tsconfig.lint.json`
     * includes them and emits nothing.
     */
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["./tsconfig.lint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
