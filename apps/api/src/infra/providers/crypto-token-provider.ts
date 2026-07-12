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

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
