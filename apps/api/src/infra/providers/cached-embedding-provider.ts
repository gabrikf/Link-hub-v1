import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";
import {
  recordEmbeddingCacheHit,
  recordEmbeddingCacheMiss,
} from "../observability/metrics.js";

interface CachedValue {
  embedding: number[];
  expiresAt: number;
}

/**
 * In-memory memoisation in front of a real embedding provider.
 *
 * MUST BE REGISTERED AS A SINGLETON. tsyringe rejects
 * `{ lifecycle: Lifecycle.Singleton }` on a factory provider, so the container
 * wraps the factory in `instanceCachingFactory(...)` instead. The cache is an
 * instance field: under tsyringe's default *transient* lifecycle every
 * `container.resolve(TOKENS.EmbeddingProvider)` hands back a brand new instance
 * with an empty `Map`, so the cache can only ever hit within a single resolved
 * object — i.e. never, because every recruiter search resolves its own use case
 * and therefore its own provider. The hit ratio was structurally 0% and every
 * repeated search was billed again. Do not revert the registration; the
 * `embedding_cache_events_total` counter below is how you would notice.
 */
export class CachedEmbeddingProvider implements IEmbeddingProvider {
  private readonly cache = new Map<string, CachedValue>();

  /**
   * Requests for a key that is currently being fetched, so N concurrent callers
   * share one API call instead of each starting their own.
   *
   * Storing the resolved value alone is not enough: the cache is only written
   * *after* the delegate resolves, so ten recruiters submitting the same search
   * within the same second would all miss, all call OpenAI, and all pay. That is
   * precisely the burst this cache exists to stop.
   *
   * The entry is removed once the call settles — including on rejection, so a
   * transient API failure is retried rather than memoised.
   */
  private readonly inFlight = new Map<string, Promise<number[]>>();

  constructor(
    private readonly delegate: IEmbeddingProvider,
    private readonly ttlSeconds: number,
    private readonly maxItems: number,
  ) {}

  async createEmbedding(text: string): Promise<number[]> {
    const normalized = text.trim().toLowerCase();
    /**
     * The key covers the two inputs that change the returned vector: the model
     * and the normalised text. It is read per call (not per instance) on
     * purpose — `OpenAiEmbeddingProvider.createEmbedding` reads the same
     * variable at the same moment, so key and delegate can never disagree about
     * which model produced the cached vector, even if the process's environment
     * were mutated at runtime (the test suite does exactly that).
     *
     * EMBEDDING_VERSION is deliberately NOT in the key: it is a generation
     * marker used to force stored vectors to be recomputed, and bumping it
     * without changing the model would produce a byte-identical vector, so
     * serving the cached one is correct.
     */
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
      recordEmbeddingCacheHit();
      return cached.embedding;
    }

    if (cached) {
      // Expired: drop it now so a stale key can't outrank a live one.
      this.cache.delete(key);
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      // Counted as a hit: no API call is made on this lookup's behalf, which is
      // exactly what the ratio below is meant to measure.
      recordEmbeddingCacheHit();
      return pending;
    }

    // Counted before the call, so an expiry and a cold key are both a miss —
    // hit / (hit + miss) is then exactly "share of lookups we did not pay for".
    recordEmbeddingCacheMiss();

    const request = this.delegate
      .createEmbedding(text)
      .then((embedding) => {
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
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);

    return request;
  }
}
