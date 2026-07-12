/**
 * Runtime configuration, read once from the environment at startup.
 *
 * - LINKHUB_API_URL   base URL of the LinkHub API (default http://localhost:3333)
 * - LINKHUB_API_TOKEN Personal Access Token (`lh_pat_...`) — REQUIRED
 */
export interface LinkHubConfig {
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

let cached: LinkHubConfig | null = null;

/**
 * Loads and validates configuration. Fails fast (throws ConfigError) when the
 * PAT is missing. The result is memoized so tools share a single config.
 */
export function loadConfig(): LinkHubConfig {
  if (cached) return cached;

  const apiUrl = (process.env.LINKHUB_API_URL ?? DEFAULT_API_URL)
    .trim()
    .replace(/\/+$/, "");

  const token = process.env.LINKHUB_API_TOKEN?.trim();

  if (!token) {
    throw new ConfigError(
      "LINKHUB_API_TOKEN is not set. Create a Personal Access Token (lh_pat_...) " +
        "in the LinkHub app under Settings → Personal Access Tokens, then expose it " +
        "as the LINKHUB_API_TOKEN environment variable for this MCP server.",
    );
  }

  cached = { apiUrl, token };
  return cached;
}
