import { config } from "@repo/eslint-config/node";

/**
 * Syntactic lint for `apps/extractor`. This is the config `npm run lint` uses, and it is
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
     * `dist/bin/*.js`, the tsc build output, not `src/bin/*.ts`. Without this it
     * cannot tell `src/bin/crafthub-extract.ts` and `src/bin/crafthub-hook.ts`
     * are the files that become the published `bin` entries, and flags their
     * shebangs as unnecessary even though the built files (the actual
     * `npx crafthub-extract` / `npx crafthub-hook` entry points) need one.
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
