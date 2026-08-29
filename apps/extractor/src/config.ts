/**
 * Runtime configuration, read once from the environment.
 *
 * - CRAFTHUB_API_URL   base URL of the CraftHub API (default http://localhost:3333)
 * - CRAFTHUB_API_TOKEN Personal Access Token (`lh_pat_...`) — REQUIRED to upload
 *
 * Identical in shape and defaults to `apps/mcp/src/config.ts` on purpose: the
 * same PAT, minted in the same Settings screen, drives the MCP server and this
 * CLI, and a user who has one working should not have to learn a second story.
 *
 * The one difference is *when* it is loaded. The MCP server fails fast at
 * startup because it cannot do anything without a token. This CLI's whole point
 * is that extraction is local, so `loadConfig` is called only on the upload
 * path — extracting and reviewing a payload works with no token at all, and
 * with the network unplugged.
 */
export interface CraftHubConfig {
  readonly apiUrl: string;
  readonly token: string;
}

const DEFAULT_API_URL = "http://localhost:3333";

/** Thrown when required configuration is missing. Message is user-facing. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

let cached: CraftHubConfig | null = null;

/**
 * Loads and validates configuration. Fails fast (throws ConfigError) when the
 * PAT is missing. The result is memoized so a multi-batch upload shares one
 * config.
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
        "in the CraftHub app under Settings → Personal Access Tokens with the " +
        "activity:write scope checked, then expose it as the CRAFTHUB_API_TOKEN " +
        "environment variable. Extraction works without it — only uploading needs a token.",
    );
  }

  cached = { apiUrl, token };
  return cached;
}

/** Test seam: forget the memoized config. Not used by the CLIs. */
export function resetConfigCache(): void {
  cached = null;
}
