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
  /**
   * Generate a random, URL-safe secret with no prefix and no display half —
   * 32 bytes, base64url. Used for the email-verification link, where the token
   * travels in a query string and is never shown to anyone.
   *
   * Lives here rather than being generated inline so `src/core/` keeps its
   * promise of not importing node builtins for crypto, and so both the api-token
   * and the verification-token paths draw from one audited source of randomness.
   */
  generateOpaqueToken(): string;
  /** Deterministically hash a full token string (sha256 hex). */
  hash(token: string): string;
}
