import base from "./eslint.config.js";
import { config as typed } from "@repo/eslint-config/typed";

/**
 * Syntactic + type-aware, for `scripts/guardrails/lint-changed.mjs`.
 *
 * Everything here is plain JavaScript, and the shared typed config disables the
 * type-checked rules for `**\/*.js` / `**\/*.mjs`, so in practice this resolves
 * to the syntactic layer plus nothing. It exists because the ratchet requires
 * each lintable directory to own an `eslint.typed.config.js`, and because the
 * day this Worker grows a `.ts` file the type-aware rules should already be
 * pointed at it rather than needing to be remembered.
 *
 * Built from the sibling `eslint.config.js` so the two cannot drift.
 */
export default [...base, ...typed];
