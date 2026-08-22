import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.EMBEDDING_MODEL;
  });

  it("returns cached embedding for repeated query", async () => {
    const provider = new FakeEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, 60, 100);

    const first = await cached.createEmbedding("Senior backend engineer");
    const second = await cached.createEmbedding("senior backend engineer");

    expect(first).toEqual(second);
    expect(provider.calls).toBe(1);
  });

  it("does not touch the delegate again on any number of repeats", async () => {
    const provider = new FakeEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, 60, 100);

    await cached.createEmbedding("react engineer");
    expect(provider.calls).toBe(1);

    // Every one of these is a request that used to be billed. Zero *extra*
    // delegate calls is the whole point of the class.
    for (let i = 0; i < 5; i += 1) {
      await cached.createEmbedding("  React Engineer  ");
    }

    expect(provider.calls).toBe(1);
  });

  it("shares state across calls on the SAME instance — the singleton contract", async () => {
    const provider = new FakeEmbeddingProvider();

    // This is what a singleton registration buys: one instance answering many
    // requests. Registered transiently, tsyringe hands out a fresh instance
    // (and a fresh empty Map) per resolve, which is what `separateInstances`
    // below simulates — the hit ratio is then structurally zero.
    const shared = new CachedEmbeddingProvider(provider, 60, 100);
    await shared.createEmbedding("kubernetes");
    await shared.createEmbedding("kubernetes");
    expect(provider.calls).toBe(1);

    const separateInstances = [
      new CachedEmbeddingProvider(provider, 60, 100),
      new CachedEmbeddingProvider(provider, 60, 100),
    ];
    for (const instance of separateInstances) {
      await instance.createEmbedding("kubernetes");
    }

    expect(provider.calls).toBe(3);
  });

  it("re-fetches once the TTL has expired", async () => {
    vi.useFakeTimers();

    const provider = new FakeEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, 60, 100);

    await cached.createEmbedding("terraform");
    expect(provider.calls).toBe(1);

    vi.advanceTimersByTime(59_000);
    await cached.createEmbedding("terraform");
    expect(provider.calls).toBe(1);

    // A vector is only as good as the model behind it; the TTL bounds how long
    // a redeploy with a different model can keep serving the old space.
    vi.advanceTimersByTime(2_000);
    await cached.createEmbedding("terraform");
    expect(provider.calls).toBe(2);
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

  it("never grows past maxItems", async () => {
    const provider = new FakeEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, 60, 3);

    for (let i = 0; i < 50; i += 1) {
      await cached.createEmbedding(`query-${i}`);
    }

    // An unbounded Map of 1536-float vectors is ~6 KB per entry — a slow OOM on
    // a small container rather than a cost saving.
    const size = (
      cached as unknown as { cache: Map<string, unknown> }
    ).cache.size;
    expect(size).toBe(3);
    expect(provider.calls).toBe(50);
  });

  it("keys by model, so a model switch cannot serve vectors from the old space", async () => {
    const provider = new FakeEmbeddingProvider();
    const cached = new CachedEmbeddingProvider(provider, 60, 100);

    await cached.createEmbedding("golang");
    expect(provider.calls).toBe(1);

    // Cosine distance between vectors from two different models is a number,
    // but a meaningless one — the key has to separate them.
    process.env.EMBEDDING_MODEL = "text-embedding-3-large";
    await cached.createEmbedding("golang");
    expect(provider.calls).toBe(2);
  });
});
