import { describe, expect, it } from "vitest";
import { OpenAiEmbeddingProvider } from "./openai-embedding-provider.js";

interface FakeClient {
  embeddings: {
    create: (args: unknown) => Promise<{ data: Array<{ embedding?: number[] }> }>;
  };
}

/**
 * Reaches into the private client so the provider's own error handling can be
 * tested without an API key or a network round trip.
 */
function withFakeClient(
  provider: OpenAiEmbeddingProvider,
  data: Array<{ embedding?: number[] }>,
): OpenAiEmbeddingProvider {
  const client: FakeClient = {
    embeddings: { create: async () => ({ data }) },
  };

  (provider as unknown as { client: FakeClient }).client = client;
  return provider;
}

describe("OpenAiEmbeddingProvider", () => {
  it("throws when the API answers without an embedding", async () => {
    const provider = withFakeClient(new OpenAiEmbeddingProvider("test-key"), []);

    // Returning `[]` here let a provider failure travel to a cosine comparison
    // or to `toPgVectorParam` and blow up somewhere unrelated to the cause
    // (defect F28). Failing at the source means the queue's retry sees the real
    // error and the resume keeps its previous, valid vector.
    await expect(provider.createEmbedding("react")).rejects.toThrow(
      /no embedding/i,
    );
  });

  it("throws when the API answers with an empty vector", async () => {
    const provider = withFakeClient(new OpenAiEmbeddingProvider("test-key"), [
      { embedding: [] },
    ]);

    await expect(provider.createEmbedding("react")).rejects.toThrow(
      /no embedding/i,
    );
  });

  it("returns the embedding when there is one", async () => {
    const provider = withFakeClient(new OpenAiEmbeddingProvider("test-key"), [
      { embedding: [0.1, 0.2] },
    ]);

    await expect(provider.createEmbedding("react")).resolves.toEqual([
      0.1, 0.2,
    ]);
  });

  it("bounds how long one call can hold a worker slot", () => {
    const provider = new OpenAiEmbeddingProvider("test-key");
    const client = (provider as unknown as { client: { timeout: number } })
      .client;

    // The SDK default is 10 minutes x 3 attempts. This provider runs with only
    // a handful of worker slots, so one hung request would take out a large
    // fraction of indexing throughput.
    expect(client.timeout).toBeLessThanOrEqual(60_000);
  });
});
