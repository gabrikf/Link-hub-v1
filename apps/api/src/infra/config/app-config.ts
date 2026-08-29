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

/**
 * Which mail implementation the container builds.
 *
 * "log" is not a stub — it is the supported development transport: it prints
 * the verification link so the whole flow works with nothing configured. The
 * default follows SMTP_HOST because "I set up SMTP" is the only reason anyone
 * would want the other one.
 */
export type MailTransport = "smtp" | "log";

function readMailTransport(): MailTransport {
  const raw = readString("MAIL_TRANSPORT")?.toLowerCase();

  if (raw === "smtp" || raw === "log") {
    return raw;
  }

  // Includes the typo case on purpose: MAIL_TRANSPORT=stmp falls back to the
  // configured-or-not rule rather than throwing at boot.
  return readString("SMTP_HOST") !== undefined ? "smtp" : "log";
}

/**
 * The single canonical origin links in outbound email are built from.
 *
 * NOT the same thing as WEB_APP_URL, which is a comma-separated CORS allow-list
 * and can legitimately hold three origins. A link has to pick one, and picking
 * "whichever the operator listed first" silently is worse than saying so — so
 * APP_PUBLIC_URL exists to make the choice explicit, and falls back to the
 * first WEB_APP_URL entry only so nothing new is required to boot.
 */
export const appPublicUrl = (): string =>
  readString("APP_PUBLIC_URL")?.replace(/\/+$/, "") ??
  readList("WEB_APP_URL")[0] ??
  "http://localhost:5173";

export const mailConfig = () => ({
  transport: readMailTransport(),
  from: readString("MAIL_FROM") ?? "CraftHub <no-reply@localhost>",
  smtp: {
    host: readString("SMTP_HOST"),
    port: readNumber("SMTP_PORT", 587),
    // 587 is the submission port and upgrades with STARTTLS, so false is the
    // right default for it. Set true together with SMTP_PORT=465.
    secure: readBoolean("SMTP_SECURE", false),
    user: readString("SMTP_USER"),
    password: readString("SMTP_PASSWORD"),
  },
});

/**
 * How long an emailed verification link stays usable. A day is long enough to
 * survive "I'll do it tonight" and short enough that a link forwarded or left
 * in a shared inbox stops working.
 */
export const emailVerificationConfig = () => ({
  tokenTtlHours: readNumber("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", 24),
});

/**
 * How long an emailed password-reset link stays usable.
 *
 * MINUTES, not hours, and much shorter than the verification TTL: a reset token
 * IS the account, so OWASP's guidance is that it should live no longer than 20
 * minutes. A verification link is nearly worthless to a thief by comparison,
 * which is why the two have their own knobs rather than sharing one.
 */
export const passwordResetConfig = () => ({
  tokenTtlMinutes: readNumber("PASSWORD_RESET_TOKEN_TTL_MINUTES", 20),
});

/**
 * The production floor. Half a second is far above what either branch of those
 * endpoints costs on a healthy deployment (single-digit ms locally, tens of ms
 * with a real relay), so the timer — not the work — is what the caller measures.
 * It is also short enough that nobody waiting for a reset link notices.
 */
export const AUTH_EMAIL_RESPONSE_FLOOR_DEFAULT_MS = 500;

/**
 * Fixed wall-clock time `POST /auth/forgot-password` and
 * `POST /auth/resend-verification` take to answer, whichever branch they ran.
 *
 * This is a SECURITY control, not a tuning knob: without it the two endpoints
 * answer a known address far slower than an unknown one, which is an
 * account-existence oracle regardless of the identical response body. See
 * `src/infra/http/utils/response-time-floor.ts` for the measurements and the
 * mechanism.
 *
 * The environment variable exists so the hermetic HTTP suite can run hundreds
 * of requests without paying half a second each — `build-test-app.ts` sets it,
 * and says so. Lowering it in a deployment re-opens the oracle in proportion,
 * and setting it to 0 re-opens it completely; that is left possible because an
 * operator who types 0 has said what they mean.
 */
export const authEmailResponseFloorMs = (): number => {
  const configured = readNumber(
    "AUTH_EMAIL_RESPONSE_FLOOR_MS",
    AUTH_EMAIL_RESPONSE_FLOOR_DEFAULT_MS,
  );

  // A negative floor is a typo, not a request to turn the control off, so it
  // falls back to the default instead of quietly collapsing to zero.
  return configured >= 0 ? configured : AUTH_EMAIL_RESPONSE_FLOOR_DEFAULT_MS;
};

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
  serviceName: readString("OTEL_SERVICE_NAME") ?? "crafthub-api",
  serviceNamespace: readString("OTEL_SERVICE_NAMESPACE") ?? "crafthub",
  deploymentEnvironment: readString("DEPLOYMENT_ENVIRONMENT") ?? nodeEnv(),
  metricExportIntervalMs: readNumber("OTEL_METRIC_EXPORT_INTERVAL_MS", 60_000),
  /**
   * Which process this is. Metrics that must be reported exactly once across
   * the api + two worker containers (DAU, queue depth) key off this.
   */
  role: readString("SERVICE_ROLE") ?? "api",
  /**
   * Whether `register.ts` installed the OpenTelemetry ESM loader hook.
   *
   * DEFAULTS TO FALSE, and the default is load-bearing: the hook installs
   * import-in-the-middle, which intercepts every ESM import and makes
   * `openai@4` throw on its own `_shims` initialisation. Turning it on with
   * that dependency in place crash-loops the API at boot. The reasoning, and
   * what it costs to leave off, is in `observability/register.ts`.
   *
   * `register.ts` reads this same variable straight from `process.env` — it
   * runs before this module can safely be imported — so the two must agree.
   */
  esmLoaderHook: readBoolean("OTEL_ESM_LOADER_HOOK", false),
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

  const mail = mailConfig();

  if (mail.transport === "log") {
    problems.push(
      "MAIL_TRANSPORT resolves to 'log' (set SMTP_HOST, or MAIL_TRANSPORT explicitly) — verification emails would be written to the container log instead of delivered, so no new account could ever be confirmed and every signup would dead-end at 'check your inbox'.",
    );
  }

  if (mail.transport === "smtp" && mail.smtp.host === undefined) {
    problems.push(
      "MAIL_TRANSPORT=smtp but SMTP_HOST is not set — the mail provider cannot be constructed and every verification email would fail to send.",
    );
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
