import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { config as baseConfig } from "./base.js";

/**
 * For `apps/web`. React 19 + Vite, so the two plugins that matter are
 * react-hooks (v7, whose `set-state-in-effect` rule is most of this repo's
 * recorded lint debt) and react-refresh (fast-refresh boundaries).
 *
 * `eslint-plugin-react` itself is deliberately absent: its value is mostly
 * prop-types and JSX-scope rules, and this app is TypeScript with the new JSX
 * transform, so both are dead weight.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: 2020,
    },
    rules: {
      /**
       * `import.meta.env.MODE` / `.DEV` are Vite compile-time constants, not
       * process env, so "not listed as a dependency in turbo.json" is simply
       * false about them. All 6 hits in this workspace are exactly that.
       */
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
