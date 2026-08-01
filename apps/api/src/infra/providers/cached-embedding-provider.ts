import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";

interface CachedValue {
  embedding: number[];
  expiresAt: number;
}

export class CachedEmbeddingProvider implements IEmbeddingProvider {
  private readonly cache = new Map<string, CachedValue>();

  constructor(
    private readonly delegate: IEmbeddingProvider,
    private readonly ttlSeconds: number,
    private readonly maxItems: number,
  ) {}

  async createEmbedding(text: string): Promise<number[]> {
    const normalized = text.trim().toLowerCase();
    const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
    const key = `${model}:${normalized}`;
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > now) {
      // Map iteration order is insertion order, and eviction below drops the
      // oldest key — so without this re-insert the cache is FIFO: the query a
      // recruiter runs every ten minutes gets evicted on schedule no matter how
      // often it is asked for. Deleting and re-setting moves the key to the end
      // and makes eviction least-recently-*used*.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.embedding;
    }

    if (cached) {
      // Expired: drop it now so a stale key can't outrank a live one.
      this.cache.delete(key);
    }

    const embedding = await this.delegate.createEmbedding(text);

    this.cache.delete(key);
    this.cache.set(key, {
      embedding,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    });

    while (this.cache.size > this.maxItems) {
      const lruKey = this.cache.keys().next().value;
      if (lruKey === undefined) {
        break;
      }
      this.cache.delete(lruKey);
    }

    return embedding;
  }
}
