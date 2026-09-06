import {
  AiQuotaConsumption,
  AiQuotaOperation,
  IAiQuotaProvider,
  nextUtcMidnight,
  utcDayKey,
} from "./ai-quota-provider.js";

/**
 * Test double for `RedisAiQuotaProvider`, and the fallback registration when
 * there is no Redis to count in.
 *
 * The clock is injected so a test can step over a UTC midnight without waiting
 * for one, which is the only way to pin the daily-reset behaviour at all.
 *
 * NOTE the single-process caveat: as a DI fallback this counts per container,
 * so N replicas allow N x limit. That is an acceptable ceiling for a
 * best-effort spend cap and is exactly why Redis is preferred in production.
 */
export class InMemoryAiQuotaProvider implements IAiQuotaProvider {
  private readonly counters = new Map<string, number>();
  private readonly now: () => Date;

  constructor(options?: { now?: () => Date }) {
    this.now = options?.now ?? (() => new Date());
  }

  async consume(
    userId: string,
    operation: AiQuotaOperation,
    limit: number,
  ): Promise<AiQuotaConsumption> {
    const now = this.now();
    const key = counterKey(userId, operation, now);

    // Increment first, then compare — same ordering as the Redis
    // implementation, so a test that passes here means something there.
    const used = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, used);

    return {
      allowed: used <= limit,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetAt: nextUtcMidnight(now),
    };
  }

  async refund(userId: string, operation: AiQuotaOperation): Promise<void> {
    const key = counterKey(userId, operation, this.now());
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, Math.max(0, current - 1));
  }

  /** Test affordance: units spent today, without spending one to find out. */
  usedToday(userId: string, operation: AiQuotaOperation): number {
    return this.counters.get(counterKey(userId, operation, this.now())) ?? 0;
  }

  clear() {
    this.counters.clear();
  }
}

function counterKey(
  userId: string,
  operation: AiQuotaOperation,
  now: Date,
): string {
  return `${operation}:${userId}:${utcDayKey(now)}`;
}
