import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import {
  httpRequestDuration,
  httpRequestsTotal,
  httpServerErrorsTotal,
} from "../../observability/metrics.js";
import { recordDailyActiveUser } from "../../observability/observable-metrics.js";

/**
 * The RED signals (Rate, Errors, Duration) for every HTTP response, plus the
 * daily-active-user roll-up.
 *
 * Registered once at the root of the server so it also sees responses that
 * never reached a handler — 404s, 429s from the rate limiter, and anything a
 * preHandler guard short-circuits.
 */

/**
 * The label used when no route matched. A 404 has no route template, and using
 * the raw URL there would mint one time series per path a scanner probes: a
 * single afternoon of `/wp-admin/...` traffic would exhaust the 10,000-series
 * budget described in `metrics.ts` on its own.
 */
const UNMATCHED_ROUTE = "__unmatched__";

const VERSION_PREFIX = "/api/v1";

/**
 * Every module in `routes/index.ts` is registered twice — bare and under
 * `/api/v1` — so the same handler produces two route templates. Collapsing the
 * prefix halves the RED series count and, more usefully, means a dashboard
 * shows one line per endpoint instead of two that have to be summed by eye.
 */
function toRouteLabel(url: string | undefined): string {
  if (!url) {
    return UNMATCHED_ROUTE;
  }

  if (url === VERSION_PREFIX) {
    return "/";
  }

  if (url.startsWith(`${VERSION_PREFIX}/`)) {
    return url.slice(VERSION_PREFIX.length);
  }

  return url;
}

async function httpObservability(fastify: FastifyInstance) {
  /**
   * Callback style rather than `async`: an async hook returns a promise that
   * Fastify tracks, and a rejection from a metrics call would surface on the
   * response path. Everything below is synchronous and cannot throw
   * meaningfully — the OTel instruments are no-ops without a MeterProvider, and
   * `recordDailyActiveUser` is fire-and-forget with its own catch.
   */
  fastify.addHook("onResponse", (request, reply, done) => {
    const attributes = {
      route: toRouteLabel(request.routeOptions?.url),
      method: request.method,
      status: String(reply.statusCode),
    };

    // `elapsedTime` is milliseconds; the histogram buckets are seconds.
    httpRequestDuration.record(reply.elapsedTime / 1000, attributes);
    httpRequestsTotal.add(1, attributes);

    if (reply.statusCode >= 500) {
      httpServerErrorsTotal.add(1, attributes);
    }

    // Whoever authenticated on this request counts towards today's DAU. The id
    // goes into a Redis HyperLogLog, never onto a metric label.
    const userId = request.user?.id;
    if (userId) {
      recordDailyActiveUser(userId);
    }

    done();
  });
}

export const httpObservabilityPlugin = fp(httpObservability, {
  name: "http-observability",
});
