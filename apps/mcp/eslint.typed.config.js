import base from "./eslint.config.js";
import { config as typed } from "@repo/eslint-config/typed";

/**
 * Syntactic + type-aware, for `scripts/guardrails/lint-changed.mjs`.
 *
 * Deliberately not the config `npm run lint` uses. Run repo-wide these rules
 * report the whole recorded backlog, and a gate that is red on arrival is a
 * gate people learn to bypass. The ratchet compares per file and rule instead,
 * so a finding you introduce fails and one you inherited does not.
 *
 * Built from the sibling `eslint.config.js` rather than from
 * `@repo/eslint-config/node` directly, so the two can never drift. They did:
 * this file used to re-import the shared base and therefore dropped the local
 * `settings.n.convertPath` override next door, which is what teaches
 * `n/hashbang` that `src/**\/*.ts` becomes `dist/**\/*.js`. Without it the
 * ratchet flagged the shebangs on the published bin entries as unnecessary —
 * three findings that were a config gap, not debt, and whose "fix" would have
 * broken the installed CLIs.
 */
export default [...base, ...typed];
