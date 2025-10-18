import { IHashProvider } from "./hash-provider.js";

export class InMemoryHashProvider implements IHashProvider {
  async hash(plain: string): Promise<string> {
    // For testing purposes, we'll just prefix the password with "hashed_"
    // This allows us to verify the password was hashed without actually hashing
    return `hashed_${plain}`;
  }
  compare(plain: string, hashed: string): Promise<boolean> {
    return Promise.resolve(hashed === `hashed_${plain}`);
  }
}
