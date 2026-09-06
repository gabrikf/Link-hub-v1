import { config } from "@repo/eslint-config/node";

/**
 * Syntactic lint for `apps/mcp`. This is the config `npm run lint` uses, and it is
 * expected to be GREEN across the whole repo — if it is red, something is
 * broken now, not owed.
 *
 * The type-aware rules live in `eslint.typed.config.js` beside this file. They
 * are five times slower and carry a recorded backlog, so they run through
 * `scripts/guardrails/lint-changed.mjs` against a ratchet rather than here.
 */
export default [
  ...config,
  {
    /**
     * `n/hashbang` decides whether a file needs a shebang by comparing its own
     * path, UNCONVERTED, against `package.json`'s `bin` field — which points at
     * `dist/index.js`, the tsc build output, not `src/index.ts`. Without this it
     * cannot tell `src/index.ts` is the file that becomes the published `bin`
     * entry, and flags its shebang as unnecessary even though `dist/index.js`
     * (the actual `npx crafthub-mcp` entry point) needs one.
     */
    files: ["src/**/*.ts"],
    settings: {
      n: {
        version: ">=22.0.0",
        convertPath: {
          "src/**/*.ts": ["^src/(.+)\\.ts$", "dist/$1.js"],
        },
      },
    },
  },
];
