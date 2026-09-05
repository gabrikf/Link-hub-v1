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
       * ONE ICON FAMILY, AS A CHECK.
       *
       * DESIGN.md: iconography is Feather (`react-icons/fi`). Mixing families
       * looks fine in a diff and wrong on screen — Feather is a 2px outline
       * set, Font Awesome is solid, and one `Fa` icon in a row of `Fi` icons
       * reads as a rendering bug. The brand-mark exception is carved out below
       * rather than left to memory.
       *
       * Like the layer rule in `node.js`, this lives in the shared config
       * because it was lost once when the workspace configs were regenerated
       * wholesale, silently, while the docs went on describing it as a working
       * sensor. `scripts/guardrails/lint-sensors-self-test.mjs` proves it fires.
       */
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react-icons/*", "!react-icons/fi"],
              message:
                "Iconography is react-icons/fi (Feather) — see DESIGN.md. Third-party brand " +
                "marks are the only exception; add the file to the brand-mark list in " +
                "packages/eslint-config/react.js if it genuinely renders a logo.",
            },
          ],
        },
      ],
      /**
       * `import.meta.env.MODE` / `.DEV` are Vite compile-time constants, not
       * process env, so "not listed as a dependency in turbo.json" is simply
       * false about them. All 6 hits in this workspace are exactly that.
       */
      "turbo/no-undeclared-env-vars": "off",
    },
  },
  {
    /**
     * The brand-mark exception. These four files render third-party logos
     * (LinkedIn, Google, the link-icon set) and a drag handle, none of which
     * exist in Feather. Keep the list short: every entry is a place the rule
     * does not apply, and a long list means it stopped meaning anything.
     */
    files: [
      "src/lib/link-icons.tsx",
      "src/features/auth/pages/auth-page.tsx",
      "src/features/dashboard/components/sortable-link-item.tsx",
      "src/features/profile-layout/components/grid-block-card.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    /**
     * RULE EXCEPTION — `sonarjs/deprecation`, one rule, one file.
     *
     * `use-clipboard.ts` copies personal access tokens. It calls
     * `navigator.clipboard.writeText` first; `document.execCommand("copy")` is
     * the `catch` branch three lines below it, reached only where the async
     * Clipboard API is absent or refused — a non-secure origin, an
     * `document.hasFocus()`-less context, a browser that denies the permission.
     * The deprecated call IS the fallback, and it is the only fallback that
     * exists: the sole non-deprecated clipboard API is `navigator.clipboard`,
     * which is already the primary path. "Fixing" the finding means deleting a
     * working fallback and silently failing to copy a token the user asked for.
     *
     * So this is not deferred work — there is nothing to migrate to. Revisit
     * only when the repo's browser support matrix drops every context where
     * `navigator.clipboard` is unavailable, at which point the whole `catch`
     * branch goes, not just the deprecated call.
     *
     * Scoped to the one rule on the one path: `sonarjs/deprecation` keeps
     * firing on every other file in `apps/web`, and every other rule keeps
     * firing on this one.
     */
    files: ["src/features/settings/lib/use-clipboard.ts"],
    rules: { "sonarjs/deprecation": "off" },
  },
];
