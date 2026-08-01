export const API_TOKEN_PREFIX = "lh_pat_";

export interface GeneratedToken {
  /** Full plaintext token, e.g. `lh_pat_<40 hex chars>`. Returned once. */
  token: string;
  /** sha256 hex of the full token — deterministic, for O(1) lookup. */
  tokenHash: string;
  /** First ~12 chars incl the `lh_pat_` prefix, safe to store/display. */
  tokenPrefix: string;
}

export interface ITokenProvider {
  /** Generate a new random personal access token + its hash + display prefix. */
  generate(): GeneratedToken;
  /** Deterministically hash a full token string (sha256 hex). */
  hash(token: string): string;
}
