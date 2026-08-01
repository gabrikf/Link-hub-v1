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

  it("evicts the least recently used query, not the oldest one", async () => {
    const provider = new FakeEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, 60, 2);

    await cached.createEmbedding("react");
    await cached.createEmbedding("kubernetes");

    // "react" is now the oldest entry but the most recently used one. A recruiter
    // who keeps re-running the same search must not be the one paying for a miss.
    await cached.createEmbedding("react");
    await cached.createEmbedding("terraform");

    expect(provider.calls).toBe(3);

    await cached.createEmbedding("react");
    expect(provider.calls).toBe(3);

    // "kubernetes" is the one that went, since nothing touched it after insert.
    await cached.createEmbedding("kubernetes");
    expect(provider.calls).toBe(4);
  });
});
