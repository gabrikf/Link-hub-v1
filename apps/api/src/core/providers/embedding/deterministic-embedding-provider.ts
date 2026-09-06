import { IEmbeddingProvider } from "./embedding-provider.js";

/** Matches `vector(1536)` so a dev-mode vector is storable in Postgres. */
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * Dimensionality that keeps search tests fast while leaving enough room for
 * hashing collisions to stay rare — the usual "feature hashing" sweet spot for
 * a few thousand distinct tokens.
 */
export const TEST_EMBEDDING_DIMENSIONS = 256;

/**
 * FNV-1a, 32-bit. Cheap, well-distributed, and — the point here — identical on
 * every machine and every run, so a search test can never be flaky because a
 * hash changed.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    // hash * 16777619 in 32-bit arithmetic, without overflowing to a float.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

/**
 * Splits on anything that is not a letter, digit or one of the characters that
 * are part of a technology's name (`c++`, `c#`, `node.js`). Accents are folded
 * so `São` and `Sao` land on the same axis.
 */
function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((token) => token.length > 0);
}

/**
 * Offline embedding provider with real semantic locality.
 *
 * Two properties matter, and the previous implementation had neither:
 *  - **Locality.** Documents sharing words must be closer than documents that
 *    do not. The old version summed `charCode % 89` into the bucket at the
 *    character's *position*, so similarity measured little more than "are these
 *    strings the same length with similar bytes in the same places". A search
 *    test written against that could pass while the ranking was nonsense.
 *  - **Determinism.** Same text in, same vector out, on every machine and in
 *    every process — so an offline search test is reproducible and never flaky.
 *
 * The technique is signed feature hashing (the "hashing trick"): each token is
 * hashed to a dimension and to a sign, and contributes ±weight there. Sharing a
 * token moves two documents along the same axis in the same direction, which is
 * exactly the locality property; the sign stops unrelated tokens accumulating a
 * systematic positive bias that would make everything look similar to
 * everything. The result is L2-normalised, so a dot product *is* the cosine
 * similarity and a longer document does not score higher for being longer.
 *
 * Bigrams are hashed alongside unigrams at half weight so word order carries
 * some signal — "senior engineer" and "engineer senior" should not be identical.
 *
 * **Why this lives in `src/core/providers/`.** It is not merely a test double:
 * `src/infra/di/container.ts` registers it as the production fallback whenever
 * `OPENAI_API_KEY` is absent. It still belongs beside its `IEmbeddingProvider`
 * port because it is pure — integer hashing and string tokenisation, with no
 * I/O, no SDK and no infra import — which is the same reason the in-memory
 * providers next door sit in core. That purity is the condition, not an
 * accident: an adapter here that grows a network call must move to
 * `src/infra/providers/`.
 */
export class DeterministicEmbeddingProvider implements IEmbeddingProvider {
  constructor(
    private readonly dimensions: number = DEFAULT_EMBEDDING_DIMENSIONS,
  ) {}

  async createEmbedding(text: string): Promise<number[]> {
    return this.embed(text);
  }

  /** Synchronous form, for tests that want a vector without awaiting. */
  embed(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);

    for (const [index, token] of tokens.entries()) {
      this.addFeature(vector, token, 1);

      // The bigram exists exactly when there is a next token — the same
      // condition the old `index + 1 < tokens.length` expressed, now in a form
      // that also gives the token a non-optional type.
      const nextToken = tokens[index + 1];
      if (nextToken !== undefined) {
        this.addFeature(vector, `${token}_${nextToken}`, 0.5);
      }
    }

    let magnitudeSquared = 0;
    for (const value of vector) {
      magnitudeSquared += value * value;
    }

    const magnitude = Math.sqrt(magnitudeSquared) || 1;
    return vector.map((value) => value / magnitude);
  }

  private addFeature(vector: number[], feature: string, weight: number): void {
    const bucket = fnv1a(feature) % this.dimensions;
    // The sign comes from a *different* hash so sign and bucket are
    // independent; reusing a bit of the same hash correlates them.
    const sign = fnv1a(`sign:${feature}`) % 2 === 0 ? 1 : -1;

    // `bucket` is a modulo of `this.dimensions` and the vector is built with
    // that length, so the slot is there; reading it explicitly beats asserting
    // that a caller never passes a shorter vector.
    vector[bucket] = (vector[bucket] ?? 0) + sign * weight;
  }
}
