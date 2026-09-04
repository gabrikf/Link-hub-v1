import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // ONE ICON FAMILY, AS A CHECK.
      //
      // DESIGN.md: iconography is Feather (`react-icons/fi`). Mixing families
      // is the kind of thing that looks fine in the diff and wrong on the
      // screen — Feather is a 2px outline set, Font Awesome is solid, and a
      // single `Fa` icon in a row of `Fi` icons reads as a rendering bug.
      //
      // The exception, carved out below rather than left to memory: THIRD-PARTY
      // BRAND MARKS. There is no Feather LinkedIn, Google or GitHub glyph, and
      // drawing an approximation of somebody's logo is worse than importing it.
      // Those live in exactly three places and nowhere else.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react-icons/*", "!react-icons/fi"],
              message:
                "Iconography is react-icons/fi (Feather) — see DESIGN.md. Third-party brand " +
                "marks are the only exception and belong in lib/link-icons.tsx, the auth page, " +
                "or a drag handle; add the file to the ignores list in eslint.config.js if it " +
                "is genuinely a brand mark.",
            },
          ],
        },
      ],
    },
  },
  {
    // The brand-mark exception. These files render third-party logos (LinkedIn,
    // Google, and the link-icon set) and a drag handle, none of which exist in
    // Feather. Keep this list short: every entry is a place the icon family
    // rule does not apply, and a long list means the rule stopped meaning
    // anything.
    files: [
      'src/lib/link-icons.tsx',
      'src/features/auth/pages/auth-page.tsx',
      'src/features/dashboard/components/sortable-link-item.tsx',
      'src/features/profile-layout/components/grid-block-card.tsx',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
