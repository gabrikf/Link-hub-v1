/**
 * Central, typed reader for the environment knobs added by the production
 * hardening pass.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: every value here has a development
 * default, and no new variable is ever required to boot. `npm run dev` must
 * keep working against `docker-compose.dev.yml` with the `.env` that already
 * exists, so anything unset degrades to the permissive local behaviour rather
 * than throwing. The one exception is `assertProductionConfig()` below, which
 * is opt-in and only fires when NODE_ENV === "production".
 *
 * Pre-existing variables (DATABASE_URL, REDIS_URL, OPENAI_API_KEY, S3_*, JWT_*)
 * are deliberately NOT moved here — they are read at their point of use today
 * and relocating them would be a refactor with no payoff.
 */

const DEFAULT_PORT = 3333;

/** Origins allowed when WEB_APP_URL is unset — i.e. local development. */
const DEV_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

function readString(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Bare `Number(...)` is used all over this codebase and silently yields NaN on
 * a typo'd value. Anything read here falls back instead of poisoning a limit.
 */
function readNumber(name: string, fallback: number): number {
  const raw = readString(name);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readString(name)?.toLowerCase();
  if (raw === undefined) {
    return fallback;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return fallback;
}

function readList(name: string): string[] {
  const raw = readString(name);
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter((value) => value.length > 0);
}

export const nodeEnv = (): string => process.env.NODE_ENV ?? "development";

export const isProduction = (): boolean => nodeEnv() === "production";

export const isTest = (): boolean => nodeEnv() === "test";

export const httpConfig = () => ({
  port: readNumber("PORT", DEFAULT_PORT),
  host: readString("HOST") ?? "0.0.0.0",
  /**
   * Whether to derive the client IP from `X-Forwarded-For`.
   *
   * This is what makes per-IP rate limiting mean anything in production. Behind
   * Caddy every request arrives from the proxy's address on the compose
   * network, so without it `req.ip` is one single value for the entire
   * internet — and the 100 req/min limit becomes a global cap that the site's
   * own users trip at roughly two requests per second.
   *
   * Trusting the header is only safe because the API is not directly
   * reachable: docker-compose.prod.yml publishes it on 127.0.0.1 alone and
   * Caddy is the sole ingress. If that ever changes, a client could forge
   * `X-Forwarded-For` and mint itself an unlimited number of buckets — so this
   * defaults to false outside production, where the API is spoken to directly.
   */
  trustProxy: readBoolean("TRUST_PROXY", isProduction()),
});

/**
 * `WEB_APP_URL` accepts a comma-separated list so a staging domain or the
 * Cloudflare Pages preview URL can be added without a code change.
 *
 * Outside production the local Vite origins are ALWAYS appended, never merely
 * used as a fallback. `apps/api/.env` already sets
 * `WEB_APP_URL=http://localhost:5173`, so a fallback-only rule would have
 * quietly narrowed development from the old `origin: "*"` down to that single
 * origin — breaking anyone who browses to `127.0.0.1:5173` instead of
 * `localhost:5173`. Production stays strictly the configured list.
 */
export const corsOrigins = (): string[] => {
  const configured = readList("WEB_APP_URL");

  if (isProduction()) {
    return configured;
  }

  return [...new Set([...configured, ...DEV_CORS_ORIGINS])];
};

/**
 * Whether Fastify runs with a real pino logger.
 *
 * Single source of truth, read by BOTH `server.ts` (to build the logger option)
 * and `global-error-handler.ts` (to decide whether `request.log` actually goes
 * anywhere). When this is false Fastify installs a no-op logger, so the error
 * handler has to fall back to `console.error` or errors vanish from the local
 * terminal — which is how they have always been surfaced in development.
 */
export const structuredLoggingEnabled = (): boolean => isProduction();

export const rateLimitConfig = () => ({
  /**
   * Globally 100 req/min per IP in production. In development the ceiling is
   * high enough to be invisible — Vite's dev server plus React StrictMode
   * double-invocation can burst well past a production-shaped limit, and a
   * local 429 would look like a broken feature.
   */
  max: readNumber("RATE_LIMIT_MAX", isProduction() ? 100 : 100_000),
  timeWindowMs: readNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  enabled: readBoolean("RATE_LIMIT_ENABLED", true),
});

export type AiQuotaOperation = "resume_parse" | "recruiter_search";

/**
 * Per-user, per-day caps on the two routes that spend OpenAI credits.
 * Disabled outside production so local work is never throttled, and disabled
 * entirely when there is no Redis to count in.
 */
export const aiQuotaConfig = () => ({
  enabled: readBoolean("AI_QUOTA_ENABLED", isProduction()),
  limits: {
    resume_parse: readNumber("AI_QUOTA_RESUME_PARSE_DAILY", 5),
    recruiter_search: readNumber("AI_QUOTA_RECRUITER_SEARCH_DAILY", 30),
  } satisfies Record<AiQuotaOperation, number>,
});

export const imageOptimizationConfig = () => ({
  enabled: readBoolean("IMAGE_OPTIMIZATION_ENABLED", true),
  maxDimension: readNumber("IMAGE_MAX_DIMENSION", 1600),
  quality: readNumber("IMAGE_QUALITY", 82),
});

/**
 * Telemetry is opt-in by the presence of the OTLP endpoint alone. No endpoint,
 * no SDK, no exporter, no cost — and, critically, no error.
 */
export const telemetryConfig = () => ({
  enabled: readString("OTEL_EXPORTER_OTLP_ENDPOINT") !== undefined,
  serviceName: readString("OTEL_SERVICE_NAME") ?? "linkhub-api",
  serviceNamespace: readString("OTEL_SERVICE_NAMESPACE") ?? "linkhub",
  deploymentEnvironment: readString("DEPLOYMENT_ENVIRONMENT") ?? nodeEnv(),
  metricExportIntervalMs: readNumber("OTEL_METRIC_EXPORT_INTERVAL_MS", 60_000),
  /**
   * Which process this is. Metrics that must be reported exactly once across
   * the api + two worker containers (DAU, queue depth) key off this.
   */
  role: readString("SERVICE_ROLE") ?? "api",
});

export const sentryConfig = () => ({
  enabled: readString("SENTRY_DSN") !== undefined,
  dsn: readString("SENTRY_DSN"),
  environment: readString("SENTRY_ENVIRONMENT") ?? nodeEnv(),
  release: readString("SENTRY_RELEASE") ?? readString("GIT_SHA"),
  tracesSampleRate: readNumber("SENTRY_TRACES_SAMPLE_RATE", 0),
});

export const isApiRole = (): boolean => telemetryConfig().role === "api";

/**
 * Fails fast on a production boot that is missing something genuinely unsafe to
 * default. Deliberately narrow: this must never fire in development, so it is
 * gated on NODE_ENV === "production" and only covers secrets whose fallback is
 * a real vulnerability rather than an inconvenience.
 */
export function assertProductionConfig(): void {
  if (!isProduction()) {
    return;
  }

  const problems: string[] = [];

  if (readString("JWT_SECRET") === undefined) {
    problems.push(
      "JWT_SECRET is not set — the container would fall back to a public literal and every session token would be forgeable.",
    );
  }

  if (readList("WEB_APP_URL").length === 0) {
    problems.push(
      "WEB_APP_URL is not set — CORS would fall back to the localhost development origins and the deployed front end could not call the API.",
    );
  }

  if (readString("DATABASE_URL") === undefined) {
    problems.push("DATABASE_URL is not set.");
  }

  if (readString("REDIS_URL") === undefined) {
    problems.push(
      "REDIS_URL is not set — the AI quota would silently fall back to a per-process in-memory counter (so N containers allow N x the daily limit, and the map is never pruned), and the rate limiter would do the same.",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with an unsafe configuration:\n- ${problems.join("\n- ")}`,
    );
  }
}
