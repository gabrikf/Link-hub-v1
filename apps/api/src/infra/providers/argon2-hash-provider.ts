import * as argon2 from "argon2";
import { IHashProvider } from "../../core/providers/hash/hash-provider.js";

export class Argon2HashProvider implements IHashProvider {
  /**
   * Hash a plain text password using Argon2
   * @param plain - The plain text password to hash
   * @returns The hashed password
   */
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id, // Using Argon2id (recommended variant)
    });
  }

  /**
   * Compare a plain text password with a hashed password
   * @param plain - The plain text password
   * @param hashed - The hashed password to compare against
   * @returns True if the passwords match, false otherwise
   */
  async compare(plain: string, hashed: string): Promise<boolean> {
    try {
      return await argon2.verify(hashed, plain);
    } catch (error) {
      // If verification fails due to invalid hash format, return false
      return false;
    }
  }
}
