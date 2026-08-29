/**
 * Runtime configuration, read once from the environment at startup.
 *
 * - CRAFTHUB_API_URL   base URL of the CraftHub API (default http://localhost:3333)
 * - CRAFTHUB_API_TOKEN Personal Access Token (`lh_pat_...`) — REQUIRED
 */
export interface CraftHubConfig {
  readonly apiUrl: string;
  readonly token: string;
}

const DEFAULT_API_URL = "http://localhost:3333";

/**
 * Thrown when required configuration is missing. Surfaced to stderr so the
 * MCP host shows a clear, actionable message instead of a cryptic crash.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

let cached: CraftHubConfig | null = null;

/**
 * Loads and validates configuration. Fails fast (throws ConfigError) when the
 * PAT is missing. The result is memoized so tools share a single config.
 */
export function loadConfig(): CraftHubConfig {
  if (cached) return cached;

  const apiUrl = (process.env.CRAFTHUB_API_URL ?? DEFAULT_API_URL)
    .trim()
    .replace(/\/+$/, "");

  const token = process.env.CRAFTHUB_API_TOKEN?.trim();

  if (!token) {
    throw new ConfigError(
      "CRAFTHUB_API_TOKEN is not set. Create a Personal Access Token (lh_pat_...) " +
        "in the CraftHub app under Settings → Personal Access Tokens, then expose it " +
        "as the CRAFTHUB_API_TOKEN environment variable for this MCP server.",
    );
  }

  cached = { apiUrl, token };
  return cached;
}
