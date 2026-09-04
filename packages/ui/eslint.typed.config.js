import { config } from "@repo/eslint-config/react";
import { config as typed } from "@repo/eslint-config/typed";

/**
 * Syntactic + type-aware, for `scripts/guardrails/lint-changed.mjs`.
 *
 * Deliberately not the config `npm run lint` uses. Run repo-wide these rules
 * report the whole recorded backlog, and a gate that is red on arrival is a
 * gate people learn to bypass. The ratchet compares per file and rule instead,
 * so a finding you introduce fails and one you inherited does not.
 */
export default [...config, ...typed];
