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
      return cached.embedding;
    }

    const embedding = await this.delegate.createEmbedding(text);

    this.cache.set(key, {
      embedding,
      expiresAt: now + this.ttlSeconds * 1000,
    });

    if (this.cache.size > this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    return embedding;
  }
}
