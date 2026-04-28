import { describe, expect, it } from "vitest";
import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";
import { CachedEmbeddingProvider } from "./cached-embedding-provider.js";

class FakeEmbeddingProvider implements IEmbeddingProvider {
  public calls = 0;

  async createEmbedding(): Promise<number[]> {
    this.calls += 1;
    return [0.9, 0.1, 0.3];
  }
}

describe("CachedEmbeddingProvider", () => {
  it("returns cached embedding for repeated query", async () => {
    const provider = new FakeEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, 60, 100);

    const first = await cached.createEmbedding("Senior backend engineer");
    const second = await cached.createEmbedding("senior backend engineer");

    expect(first).toEqual(second);
    expect(provider.calls).toBe(1);
  });
});
