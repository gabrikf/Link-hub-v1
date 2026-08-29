import { createHash, randomBytes } from "node:crypto";
import {
  API_TOKEN_PREFIX,
  GeneratedToken,
  ITokenProvider,
} from "./token-provider.js";

/**
 * The same algorithm as `CryptoTokenProvider`, declared in core so that use-case
 * tests can hash a token without importing from `src/infra/` — the layering rule
 * the use cases themselves obey by taking this through their constructor.
 *
 * A REAL sha256, unlike the other in-memory providers' toy implementations.
 * The property most worth testing here is "the raw token is never what the
 * database holds", and a fake hash of `hashed_<token>` would let a broken
 * implementation that stores the raw value pass by accident.
 */
export class InMemoryTokenProvider implements ITokenProvider {
  generate(): GeneratedToken {
    const random = randomBytes(20).toString("hex");
    const token = `${API_TOKEN_PREFIX}${random}`;

    return {
      token,
      tokenHash: this.hash(token),
      tokenPrefix: token.slice(0, API_TOKEN_PREFIX.length + 5),
    };
  }

  generateOpaqueToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
