import { IJwtProvider } from "./jwt-provider.js";

export class InMemoryJwtProvider implements IJwtProvider {
  private tokenCounter = 0;

  async sign(payload: object): Promise<string> {
    // For testing purposes, create a predictable token that includes the payload
    this.tokenCounter++;
    return `test_token_${this.tokenCounter}_${JSON.stringify(payload)}`;
  }

  async verify(token: string): Promise<object | null> {
    // For testing purposes, extract payload from our test token format
    const match = token.match(/^test_token_\d+_(.+)$/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }

  // Helper method for testing
  reset(): void {
    this.tokenCounter = 0;
  }
}
