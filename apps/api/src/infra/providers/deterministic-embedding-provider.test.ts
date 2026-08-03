import { describe, expect, it } from "vitest";
import { DeterministicEmbeddingProvider } from "./deterministic-embedding-provider.js";

const embedder = new DeterministicEmbeddingProvider(256);

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
  }
  return dot;
}

/**
 * This provider is the foundation every offline search test stands on, so its
 * two guarantees are worth pinning directly rather than inferring from search
 * results: identical output for identical input, and genuine semantic locality.
 */
describe("DeterministicEmbeddingProvider", () => {
  it("is deterministic", async () => {
    const first = await embedder.createEmbedding("senior react engineer");
    const second = await embedder.createEmbedding("senior react engineer");

    expect(second).toEqual(first);
  });

  it("produces unit vectors so a dot product is the cosine similarity", async () => {
    for (const text of ["react", "a much longer document ".repeat(50), "x"]) {
      const vector = await embedder.createEmbedding(text);
      const norm = Math.sqrt(cosine(vector, vector));
      expect(norm).toBeCloseTo(1, 10);
    }
  });

  it("matches the configured dimensionality", async () => {
    expect(await embedder.createEmbedding("react")).toHaveLength(256);
    expect(
      await new DeterministicEmbeddingProvider().createEmbedding("react"),
    ).toHaveLength(1536);
  });

  it("places documents that share words closer together", async () => {
    const query = embedder.embed("react node.js typescript full stack engineer");
    const related = embedder.embed(
      "full stack engineer working with react and node.js in typescript",
    );
    const unrelated = embedder.embed(
      "site reliability engineer operating kubernetes clusters with terraform",
    );

    // The whole point: without locality, a search test can pass while the
    // ranking it is supposedly testing is nonsense.
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it("is insensitive to case and accents", async () => {
    const plain = embedder.embed("sao paulo");
    const accented = embedder.embed("São Paulo");

    expect(cosine(plain, accented)).toBeCloseTo(1, 10);
  });

  it("gives word order some weight", async () => {
    const forwards = embedder.embed("senior engineer");
    const backwards = embedder.embed("engineer senior");

    // Bigrams differ, unigrams do not — so similar, but not identical.
    expect(cosine(forwards, backwards)).toBeGreaterThan(0.5);
    expect(cosine(forwards, backwards)).toBeLessThan(0.999);
  });

  it("does not reward padding a document with irrelevant text", async () => {
    const query = embedder.embed("react node.js");
    const honest = embedder.embed("react node.js engineer");
    const padded = embedder.embed(
      `react node.js engineer ${Array.from({ length: 400 }, (_, index) => `filler${index}`).join(" ")}`,
    );

    expect(cosine(query, padded)).toBeLessThan(cosine(query, honest));
  });
});
