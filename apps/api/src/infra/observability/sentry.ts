import * as Sentry from "@sentry/node";
import { sentryConfig } from "../config/app-config.js";

/**
 * Sentry for the API, activated by SENTRY_DSN alone.
 *
 * Without a DSN `initSentry()` does nothing and `captureApiException()` is a
 * no-op, so local development is untouched and no variable becomes required.
 *
 * Tracing is left to OpenTelemetry (`tracesSampleRate` defaults to 0): running
 * both as tracers would double-instrument every request for no extra insight.
 * Sentry here is purely the error sink.
 */

let initialised = false;

export function initSentry(): void {
  const config = sentryConfig();

  if (!config.enabled || initialised) {
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    /**
     * `tracesSampleRate` is OMITTED, not set to 0. Sentry v10 treats "defined"
     * as "tracing enabled" (`!= null`), so passing 0 still loads the automatic
     * performance integrations — its own http/fastify/pg/ioredis
     * instrumentation, layered on top of the ones `otel.ts` already registered.
     * That means duplicate spans and a second global TracerProvider that the
     * OpenTelemetry API refuses, on a box with 4GB of RAM, for no benefit.
     */
    ...(config.tracesSampleRate > 0
      ? { tracesSampleRate: config.tracesSampleRate }
      : {}),
    /**
     * OpenTelemetry is already set up by `otel.ts` and owns the tracer
     * provider. Without this flag Sentry installs its own and warns that the
     * global provider has already been registered.
     */
    skipOpenTelemetrySetup: true,
    // The API already returns structured errors to the client; sending the
    // request body along would ship resume text and recruiter queries, which
    // are user PII, into a third party.
    sendDefaultPii: false,
  });

  initialised = true;
}

export function isSentryEnabled(): boolean {
  return initialised;
}

/**
 * Report a server-side failure.
 *
 * `userId` goes on the Sentry scope, never onto a metric label — see the
 * cardinality rule in `metrics.ts`.
 */
export function captureApiException(
  error: unknown,
  context: {
    route?: string;
    method?: string;
    statusCode?: number;
    requestId?: string;
    userId?: string;
  } = {},
): void {
  if (!initialised) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    scope.setTags({
      ...(context.route ? { route: context.route } : {}),
      ...(context.method ? { method: context.method } : {}),
      ...(context.statusCode ? { status_code: String(context.statusCode) } : {}),
    });

    if (context.requestId) {
      scope.setTag("request_id", context.requestId);
    }

    Sentry.captureException(error);
  });
}

export async function flushSentry(timeoutMs = 2_000): Promise<void> {
  if (!initialised) {
    return;
  }

  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // A failed flush must not block shutdown.
  }
}
