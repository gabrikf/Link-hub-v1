import type { GitConnectionProvider } from "@repo/schemas";

/**
 * GitLab 19.0+ signing tokens are Standard-Webhooks shaped: the literal prefix
 * below followed by the BASE64 encoding of the HMAC key. Verification strips the
 * prefix and base64-DECODES the rest — the key is bytes, not the printable
 * string — so the prefix has to be shared between the generator and the
 * verifier rather than spelled out twice.
 */
export const GITLAB_SIGNING_SECRET_PREFIX = "whsec_";

/**
 * Mints the shared secret a forge signs its webhook deliveries with.
 *
 * A provider rather than `node:crypto` in a use case, for the usual layering
 * reason: core states that a connection needs a secret, infra decides what
 * randomness that secret is made of.
 */
export interface IWebhookSecretProvider {
  /**
   * A new secret for `provider`, or null when the provider delivers no signed
   * webhooks at all (`claude_code` and `extractor` are local tools that
   * authenticate with a personal access token, so handing them a webhook secret
   * would only create a credential nothing ever verifies).
   */
  generateFor(provider: GitConnectionProvider): string | null;
}
