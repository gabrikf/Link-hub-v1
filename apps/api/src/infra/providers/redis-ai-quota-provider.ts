import type { AiQuotaOperation } from "../config/app-config.js";
import {
  AiQuotaConsumption,
  IAiQuotaProvider,
  nextUtcMidnight,
  utcDayKey,
} from "../../core/providers/ai-quota/ai-quota-provider.js";
import { getRedis } from "../redis/redis-client.js";

/**
 * Daily AI spend cap, counted in Redis so every API replica shares one budget.
 *
 * Keys are `ai-quota:{operation}:{userId}:{YYYY-MM-DD}` in UTC — the same
 * boundary the DAU HyperLogLog uses, so "today" means one thing across the
 * whole system regardless of where a container happens to be running.
 */

const KEY_PREFIX = "ai-quota";

/**
 * Slack on the TTL so a key set a millisecond before midnight cannot expire
 * fractionally early and hand back a free budget to a request still in flight.
 * The key is worthless after the day rolls over anyway — the next day's writes
 * go to a different key — so an extra minute costs nothing.
 */
const TTL_GRACE_SECONDS = 60;

/**
 * The narrow slice of ioredis this provider uses. Declared structurally so the
 * unit test can hand in a fake (and a throwing fake) without constructing a
 * real client or reaching for module mocks.
 */
export interface AiQuotaRedisPipeline {
  incr(key: string): unknown;
  expire(key: string, seconds: number): unknown;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

export interface AiQuotaRedis {
  pipeline(): AiQuotaRedisPipeline;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export class RedisAiQuotaProvider implements IAiQuotaProvider {
  private readonly redis: () => AiQuotaRedis;
  private readonly now: () => Date;

  constructor(options?: { redis?: () => AiQuotaRedis; now?: () => Date }) {
    // Resolved lazily on every call rather than captured in the constructor:
    // `getRedis()` builds the shared socket on first use, and building it at DI
    // registration time would open a connection in processes that never spend a
    // unit.
    this.redis = options?.redis ?? (() => getRedis() as AiQuotaRedis);
    this.now = options?.now ?? (() => new Date());
  }

  async consume(
    userId: string,
    operation: AiQuotaOperation,
    limit: number,
  ): Promise<AiQuotaConsumption> {
    const now = this.now();
    const resetAt = nextUtcMidnight(now);
    const key = quotaKey(userId, operation, now);

    try {
      // INCR FIRST, compare after. A check-then-increment (GET, decide, INCR)
      // is two round trips with a gap in the middle, and N concurrent requests
      // from one user all read the same pre-increment value and all slip
      // through — which is precisely the burst this quota exists to stop. INCR
      // is atomic in Redis, so each request gets its own distinct ordinal and
      // exactly `limit` of them can ever come back at or under the ceiling.
      const pipeline = this.redis().pipeline();
      pipeline.incr(key);
      pipeline.expire(key, ttlSeconds(now, resetAt));

      const results = await pipeline.exec();

      const used = readIncrementedValue(results);

      if (used === null) {
        // Malformed/failed pipeline reply — treat exactly like a Redis outage.
        return failOpen(limit, resetAt);
      }

      // NOT decremented when over the limit: leaving the counter above the
      // ceiling is harmless (every further call is rejected on the same
      // comparison) and a compensating DECR would reintroduce the race the
      // INCR-first ordering just removed.
      return {
        allowed: used <= limit,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        resetAt,
      };
    } catch {
      return failOpen(limit, resetAt);
    }
  }

  async refund(userId: string, operation: AiQuotaOperation): Promise<void> {
    const now = this.now();
    const key = quotaKey(userId, operation, now);
    const ttl = ttlSeconds(now, nextUtcMidnight(now));

    try {
      const remaining = await this.redis().decr(key);

      // DECR on a missing key creates it at -1 with no expiry. Floor it back to
      // zero and re-arm the TTL so a stray refund cannot leave an immortal key
      // (or a negative counter that would hand out free units tomorrow).
      if (remaining < 0) {
        await this.redis().incr(key);
      }

      await this.redis().expire(key, ttl);
    } catch {
      // Same trade-off as `consume`: a lost refund costs the user one unit of
      // their daily budget, which is not worth failing a request over.
    }
  }
}

export function quotaKey(
  userId: string,
  operation: AiQuotaOperation,
  now: Date,
): string {
  return `${KEY_PREFIX}:${operation}:${userId}:${utcDayKey(now)}`;
}

function ttlSeconds(now: Date, resetAt: Date): number {
  return (
    Math.ceil((resetAt.getTime() - now.getTime()) / 1000) + TTL_GRACE_SECONDS
  );
}

/**
 * FAIL OPEN, on purpose.
 *
 * If Redis is unreachable the quota cannot be enforced, and the choice is
 * between letting a few extra OpenAI calls through or 429-ing every user of the
 * two AI routes for the duration of the incident. Redis being down is already
 * an incident; turning it into a product outage — and one that looks to the
 * user like they were punished — is strictly worse than the small, bounded
 * spend. Nothing is logged here either: an outage would produce one line per
 * request and bury the real error.
 */
function failOpen(limit: number, resetAt: Date): AiQuotaConsumption {
  return { allowed: true, limit, used: 0, remaining: limit, resetAt };
}

/**
 * ioredis pipelines report per-command failures inside the result tuples rather
 * than by rejecting, so a bare `exec()` await is not enough — the INCR reply has
 * to be unpacked and checked.
 */
function readIncrementedValue(
  results: Array<[Error | null, unknown]> | null,
): number | null {
  if (!results || results.length === 0) {
    return null;
  }

  const [error, value] = results[0];

  if (error || typeof value !== "number") {
    return null;
  }

  return value;
}
