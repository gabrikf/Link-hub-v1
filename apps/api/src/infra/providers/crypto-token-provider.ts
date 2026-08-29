import { createHash, randomBytes } from "node:crypto";
import {
  API_TOKEN_PREFIX,
  GeneratedToken,
  ITokenProvider,
} from "../../core/providers/token/token-provider.js";

const TOKEN_PREFIX_LENGTH = API_TOKEN_PREFIX.length + 5; // e.g. "lh_pat_ab12c"

export class CryptoTokenProvider implements ITokenProvider {
  generate(): GeneratedToken {
    // 20 random bytes -> 40 hex chars.
    const random = randomBytes(20).toString("hex");
    const token = `${API_TOKEN_PREFIX}${random}`;

    return {
      token,
      tokenHash: this.hash(token),
      tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
    };
  }

  generateOpaqueToken(): string {
    // 32 bytes -> 43 base64url chars. Comfortably past guessing, and safe in a
    // URL without any encoding of its own.
    return randomBytes(32).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
