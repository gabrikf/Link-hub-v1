/**
 * Library surface of the extractor package.
 *
 * The CLIs are the product, but two things are worth importing: the settings
 * snippet (so the CraftHub web settings page renders exactly the block
 * `crafthub-hook print-settings` prints, from one source of truth) and the
 * privacy primitives (so anything else that needs to fingerprint an identity
 * uses the same hash rather than inventing a second one).
 */
export { runExtractCli } from "./cli/extract-cli.js";
export { runHookCli } from "./cli/hook-cli.js";
export {
  claudeSettingsHooks,
  claudeSettingsSnippet,
  SETTINGS_SNIPPET_NOTES,
} from "./hook/settings-snippet.js";
export {
  deliveryIdForAgentSession,
  deliveryIdForCommit,
  fingerprintCounterparty,
  fingerprintRepo,
  normalizeRepoIdentity,
  sha256Hex,
} from "./fingerprint.js";
export {
  EXCLUDED_PATH_PATTERNS,
  inferTechnologies,
  isGeneratedOrVendored,
  technologyForPath,
} from "./technologies.js";
export { buildEnvelope, extract, resolveAuthors } from "./extract.js";
export { OMITTED_FROM_PAYLOAD, renderExtractSummary } from "./summary.js";
export { CraftHubActivityClient, CraftHubApiError } from "./api-client.js";
export { ConfigError, loadConfig } from "./config.js";
export type { ExtractorSettings } from "./settings.js";
