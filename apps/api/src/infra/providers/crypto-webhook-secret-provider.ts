import { randomBytes } from "node:crypto";
import type { GitConnectionProvider } from "@repo/schemas";
import {
  GITLAB_SIGNING_SECRET_PREFIX,
  IWebhookSecretProvider,
} from "../../core/providers/webhook-secret/webhook-secret-provider.js";

/** 256 bits, the HMAC-SHA256 block-independent minimum worth generating. */
const SECRET_BYTES = 32;

export class CryptoWebhookSecretProvider implements IWebhookSecretProvider {
  generateFor(provider: GitConnectionProvider): string | null {
    if (provider === "github") {
      // GitHub HMACs with the raw bytes of the configured string, so any
      // high-entropy printable value works. Hex keeps it copy-pasteable.
      return randomBytes(SECRET_BYTES).toString("hex");
    }

    if (provider === "gitlab") {
      // `whsec_<base64>` on purpose: the SAME stored value serves both GitLab
      // verification paths. Pasted into GitLab's "Secret token" field it comes
      // back verbatim in `X-Gitlab-Token` (legacy plaintext path), and on
      // GitLab 19.0+ it is also the Standard-Webhooks signing token whose
      // base64 body is the HMAC key. One secret, two mechanisms, no migration.
      return `${GITLAB_SIGNING_SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString("base64")}`;
    }

    // `claude_code` / `extractor` push over the authenticated ingestion
    // endpoint; there is no forge to sign anything.
    return null;
  }
}
