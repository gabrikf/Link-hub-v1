import globals from "globals";

import { config } from "@repo/eslint-config/node";

/**
 * Syntactic lint for the backup watchdog Worker.
 *
 * WHY THIS FILE EXISTS. This directory is not an npm workspace, and it never
 * needed to be — the Worker has no dependencies and its tests run on the root
 * vitest. But "not a workspace" also meant "not linted": `npm run lint` is
 * `turbo run lint`, which only sees workspaces, and
 * `scripts/guardrails/lint-changed.mjs` only lints the workspaces it lists. So
 * ~950 lines of JavaScript shipped with no lint layer at all while the repo
 * reported green. The config here plus the entry in `LINTABLE_WORKSPACES`
 * closes that: the ratchet lints these files with `cwd` set to this directory,
 * exactly as it does for a real workspace.
 *
 * `npm run lint` (turbo) still does NOT reach this directory — that would mean
 * making it a workspace and rewriting the package-lock. The ratchet inside
 * `npm run guardrails` is the layer that covers it.
 *
 * THE GLOBALS. The Worker runs on workerd, not Node: no `process`, no `fs`, but
 * `fetch`, `Response` and `console` are all there. `globals.serviceworker`
 * would be the closest named set, and it is wrong in the other direction (it
 * declares `self`, `clients` and the `install`/`activate` events this Worker
 * never has). `globals.browser` is the set that actually matches the runtime
 * surface this file touches — fetch, Response, console — without pulling in
 * Node's `process`, whose absence at runtime is the mistake worth catching.
 */
export default [
  ...config,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
