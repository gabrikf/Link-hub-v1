import jwt from "jsonwebtoken";
import { IJwtProvider } from "../../core/providers/jwt/jwt-provider.js";

export interface JwtProviderConfig {
  secret: string;
  expiresIn?: string; // e.g., '7d', '24h', '1h'
  algorithm?: jwt.Algorithm;
}

export class JwtProvider implements IJwtProvider {
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly algorithm: jwt.Algorithm;

  constructor(config: JwtProviderConfig) {
    this.secret = config.secret;
    this.expiresIn = config.expiresIn ?? "7d"; // Default: 7 days
    this.algorithm = config.algorithm ?? "HS256"; // Default: HMAC SHA256
  }

  /**
   * Sign a payload and generate a JWT token
   * @param payload - The data to encode in the token
   * @returns The signed JWT token
   */
  async sign(payload: object): Promise<string> {
    return new Promise((resolve, reject) => {
      jwt.sign(
        payload,
        this.secret,
        {
          expiresIn: this.expiresIn as string,
          algorithm: this.algorithm,
        } as jwt.SignOptions,
        (err, token) => {
          if (err || !token) {
            reject(err || new Error("Failed to generate token"));
          } else {
            resolve(token);
          }
        }
      );
    });
  }

  /**
   * Verify and decode a JWT token
   * @param token - The JWT token to verify
   * @returns The decoded payload if valid, null otherwise
   */
  async verify(token: string): Promise<object | null> {
    return new Promise((resolve) => {
      jwt.verify(
        token,
        this.secret,
        {
          algorithms: [this.algorithm],
        },
        (err, decoded) => {
          if (err || !decoded || typeof decoded === "string") {
            resolve(null);
          } else {
            resolve(decoded);
          }
        }
      );
    });
  }

  /**
   * Decode a token without verifying the signature (useful for debugging)
   * @param token - The JWT token to decode
   * @returns The decoded payload or null
   */
  decode(token: string): object | null {
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded !== "string") {
      return decoded;
    }
    return null;
  }
}
