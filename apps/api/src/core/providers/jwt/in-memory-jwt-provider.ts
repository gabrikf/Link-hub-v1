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
    const encodedPayload = /^test_token_\d+_(.+)$/.exec(token)?.[1];
    if (encodedPayload !== undefined) {
      try {
        const payload: unknown = JSON.parse(encodedPayload);
        return typeof payload === "object" && payload !== null ? payload : null;
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
