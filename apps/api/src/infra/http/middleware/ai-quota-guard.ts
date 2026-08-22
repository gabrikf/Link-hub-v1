import { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../../../core/errors/index.js";
import type { IAiQuotaProvider } from "../../../core/providers/ai-quota/ai-quota-provider.js";
import { aiQuotaConfig, type AiQuotaOperation } from "../../config/app-config.js";
import { resolve, TOKENS } from "../../di/container.js";
import { aiQuotaRejectionsTotal } from "../../observability/metrics.js";

/**
 * Per-user daily cap on the two routes that spend OpenAI credits.
 *
 * Always mounted AFTER `authGuard` in the preHandler array — it charges an
 * identity, so it needs one already on the request.
 *
 * Applied at the controller, which means both mounts of each controller (the
 * legacy path and the `/api/v1` one in `routes/index.ts`) are covered by a
 * single line, with no way for the two to drift apart.
 */

/** Reads naturally in "the daily limit of 5 <label>". */
const OPERATION_LABELS: Record<AiQuotaOperation, string> = {
  resume_parse: "resume parses",
  recruiter_search: "recruiter searches",
};

export function aiQuotaGuard(
  operation: AiQuotaOperation,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function aiQuotaPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const config = aiQuotaConfig();

    // THE DEVELOPMENT ESCAPE HATCH. Off unless NODE_ENV=production or
    // AI_QUOTA_ENABLED=true, and read per-request rather than at module load so
    // a test can flip it. Nothing below this line runs locally: no container
    // resolution, no Redis, no behaviour change to the guarded routes.
    if (!config.enabled) {
      return;
    }

    const userId = request.user?.id;

    if (!userId) {
      // Only reachable if this guard is ever mounted without an auth guard in
      // front of it. Failing loudly beats silently metering everyone as one
      // anonymous bucket.
      throw new UnauthorizedError("Authentication required");
    }

    const limit = config.limits[operation];
    const quota = resolve<IAiQuotaProvider>(TOKENS.AiQuotaProvider);
    const consumption = await quota.consume(userId, operation, limit);

    if (!consumption.allowed) {
      // `operation` only — the cardinality rule in `metrics.ts` forbids userId
      // (or anything else per-user) as a metric label: it is 10,000 series
      // waiting to happen. Two label values total.
      aiQuotaRejectionsTotal.add(1, { operation });

      const secondsUntilReset = Math.max(
        1,
        Math.ceil((consumption.resetAt.getTime() - Date.now()) / 1000),
      );

      reply.header("Retry-After", String(secondsUntilReset));

      // Sent here rather than thrown, because the global error handler builds
      // its body from an error class and there is no 429 class to throw (adding
      // one to `core/errors` is another concern's call). The shape below is the
      // handler's exact contract — error, message, statusCode, code, timestamp,
      // path — plus the three fields a client needs to show a useful message.
      await reply.status(429).send({
        error: "TOO_MANY_REQUESTS",
        message:
          `You've reached the daily limit of ${limit} ${OPERATION_LABELS[operation]}. ` +
          `Your quota resets at ${formatResetAt(consumption.resetAt)} ` +
          `(in ${formatDuration(secondsUntilReset)}).`,
        statusCode: 429,
        code: "TOO_MANY_REQUESTS",
        timestamp: new Date().toISOString(),
        path: request.url,
        limit,
        remaining: consumption.remaining,
        resetAt: consumption.resetAt.toISOString(),
      });
      return;
    }

    // The unit is spent up front (it has to be — see the INCR-first note on the
    // provider), so a request that never reaches OpenAI has to hand it back.
    //
    // Fastify has no per-request hook registration, so this rides the raw
    // response's "finish" event, which fires at exactly the moment an onResponse
    // hook would and has the final status code available.
    reply.raw.on("finish", () => {
      const status = reply.statusCode;

      // 4xx: the user's own request was rejected — a bad body, a missing
      // resume, a validation failure. No model was called, so charging for it
      // would let a client burn someone's whole daily budget on typos.
      //
      // 429 excluded: our own rejection never spent a unit to begin with, and a
      // refund would decrement the counter that is doing the rejecting.
      //
      // 5xx deliberately NOT refunded: a 500 can just as easily be a failure
      // AFTER the OpenAI call returned (a database write, a serialization bug),
      // and the credits for that call are already gone. Refunding blind would
      // make a broken deploy a free unlimited-spend window.
      if (status >= 400 && status < 500 && status !== 429) {
        void quota.refund(userId, operation).catch(() => {
          // Best-effort: a lost refund costs one unit, never a request.
        });
      }
    });
  };
}

/** `2026-08-16T00:00:00Z` — milliseconds are noise in a user-facing string. */
function formatResetAt(resetAt: Date): string {
  return resetAt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** `6h 12m`, `12m`, `45s`. */
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${totalSeconds}s`;
}
