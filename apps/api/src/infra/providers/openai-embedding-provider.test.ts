import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordOpenAiRequest,
  recordOpenAiUsage,
} from "../observability/metrics.js";
import { OpenAiEmbeddingProvider } from "./openai-embedding-provider.js";

vi.mock("../observability/metrics.js", () => ({
  recordOpenAiUsage: vi.fn(),
  recordOpenAiRequest: vi.fn(),
}));

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
  beforeEach(() => {
    vi.mocked(recordOpenAiUsage).mockReset();
    vi.mocked(recordOpenAiRequest).mockReset();
  });

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

  it("records the tokens the call was billed for", async () => {
    const provider = new OpenAiEmbeddingProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      embeddings: {
        create: async () => ({
          data: [{ embedding: [0.1] }],
          usage: { prompt_tokens: 42 },
        }),
      },
    };

    await provider.createEmbedding("react");

    // Tokens x per-model price is the only way to see spend before the invoice.
    expect(recordOpenAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "embedding", promptTokens: 42 }),
    );
    expect(recordOpenAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "embedding", outcome: "success" }),
    );
  });

  it("records a failure and re-throws the SDK's own error", async () => {
    const provider = new OpenAiEmbeddingProvider("test-key");
    const sdkError = new Error("429 rate limit");
    (provider as unknown as { client: unknown }).client = {
      embeddings: {
        create: async () => {
          throw sdkError;
        },
      },
    };

    // The identity check matters: the queue's retry and Sentry both key off the
    // SDK error's status and request id, which a wrapper would discard.
    await expect(provider.createEmbedding("react")).rejects.toBe(sdkError);
    expect(recordOpenAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "error" }),
    );
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
