/**
 * Per-user, per-day budget for the two routes that spend OpenAI credits.
 *
 * The counter is a pure infrastructure concern — there is no domain rule here,
 * only "this identity has already asked N times today" — so the concrete
 * implementation lives in `infra/providers` (Redis) and the `InMemory*` variant
 * next door stands in for it in tests.
 */

/**
 * The operations a quota is charged against.
 *
 * Declared HERE, beside the port that consumes it, rather than next to the
 * limits in `infra/config/app-config.ts`. The vocabulary belongs to the
 * interface: core names the operations, infra decides what each one costs.
 * `app-config.ts` imports this and re-exports it, so its
 * `satisfies Record<AiQuotaOperation, number>` still keeps the limits and the
 * operations in lockstep — and no consumer had to move.
 */
export type AiQuotaOperation = "resume_parse" | "recruiter_search";

export type AiQuotaConsumption = {
  allowed: boolean;
  /** The ceiling that was applied, echoed back so the caller can name it. */
  limit: number;
  /** Units spent today INCLUDING this call. May exceed `limit` — see below. */
  used: number;
  remaining: number;
  /** Next UTC midnight: the instant `used` goes back to zero. */
  resetAt: Date;
};

export interface IAiQuotaProvider {
  /**
   * Spends one unit and reports whether the caller may proceed.
   *
   * Deliberately increment-then-compare, never check-then-increment: two
   * concurrent requests from the same user must not both read "4 of 5 used" and
   * both be let through. Bursting is the abuse case this exists to stop.
   */
  consume(
    userId: string,
    operation: AiQuotaOperation,
    limit: number,
  ): Promise<AiQuotaConsumption>;

  /**
   * Gives one unit back, for a request that turned out not to spend anything
   * (a malformed body rejected before the model was ever called). Floors at 0.
   */
  refund(userId: string, operation: AiQuotaOperation): Promise<void>;
}

/** Shared by both implementations so the key/day boundary can never drift. */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The next UTC midnight strictly after `now`. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
}
