import { config } from "@repo/eslint-config/node";

/**
 * Syntactic lint for `apps/api`. This is the config `npm run lint` uses, and it is
 * expected to be GREEN across the whole repo — if it is red, something is
 * broken now, not owed.
 *
 * The type-aware rules live in `eslint.typed.config.js` beside this file. They
 * are five times slower and carry a recorded backlog, so they run through
 * `scripts/guardrails/lint-changed.mjs` against a ratchet rather than here.
 */
export default [...config];
