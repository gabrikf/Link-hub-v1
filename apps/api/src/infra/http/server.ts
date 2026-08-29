import "dotenv/config";
import { randomUUID } from "node:crypto";
import fastify, { FastifyServerOptions } from "fastify";
import { trace } from "@opentelemetry/api";
import database from "./pluguins/database.js";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { routes } from "./routes/index.js";
import { setupContainer } from "../di/container.js";
import { errorHandler } from "./middleware/global-error-handler.js";
import { httpObservabilityPlugin } from "./plugins/http-observability.js";
import {
  assertProductionConfig,
  corsOrigins,
  httpConfig,
  isProduction,
  isTest,
  rateLimitConfig,
  structuredLoggingEnabled,
  telemetryConfig,
} from "../config/app-config.js";
import { closeObservableMetrics, registerObservableMetrics } from "../observability/observable-metrics.js";
import { flushSentry, initSentry } from "../observability/sentry.js";
import { closeRedis, getRedis, isRedisConfigured } from "../redis/redis-client.js";
import { BaseError } from "../../core/errors/index.js";

// Initialize the DI container
setupContainer();

/**
 * Structured JSON logs in production, and nothing at all anywhere else.
 *
 * `logger: false` outside production is deliberate: pino's JSON firehose in
 * front of `tsx watch` makes the local terminal unreadable, and the whole point
 * of this pass was to change nothing about `npm run dev`.
 */
function loggerOptions(): FastifyServerOptions["logger"] {
  // Shared predicate: `global-error-handler.ts` reads the same function to
  // decide whether `request.log` goes anywhere, so the two can never drift.
  if (!structuredLoggingEnabled()) {
    return false;
  }

  return {
    level: process.env.LOG_LEVEL ?? "info",
    /**
     * Stamps the active OpenTelemetry ids onto every line so a log in Loki can
     * be pivoted to its trace in Tempo. Without this the two signals sit in the
     * same Grafana stack with no way to join them.
     */
    mixin() {
      const spanContext = trace.getActiveSpan()?.spanContext();

      if (!spanContext) {
        return {};
      }

      return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
    },
  };
}

const serverOptions: FastifyServerOptions = {
  logger: loggerOptions(),
  /**
   * Makes `request.ip` the real client rather than Caddy's container address.
   * Without it the per-IP rate limit below is a single global bucket — see the
   * note on `httpConfig().trustProxy`.
   */
  trustProxy: httpConfig().trustProxy,
  /**
   * Honour an upstream request id when one is present so a single id follows a
   * request across the proxy, the API and Sentry. Fastify's default is a
   * per-process counter, which collides the moment there are two containers.
   */
  genReqId: (request) => {
    const header = request.headers["x-request-id"];
    const incoming = Array.isArray(header) ? header[0] : header;

    return incoming?.trim() || randomUUID();
  },
};

const server = fastify(serverOptions);

// Register global error handler
server.setErrorHandler(errorHandler);

const allowedOrigins = corsOrigins();

server.register(fastifyCors, {
  /**
   * Function form rather than the plain array: with an array, @fastify/cors
   * rejects a request that carries no `Origin` header at all — which is every
   * curl, every server-to-server call and, critically, the Docker HEALTHCHECK.
   */
  origin: (origin, callback) => {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-refresh-token"],
});

server.register(fastifyHelmet, {
  /**
   * The Swagger UI at /docs serves inline scripts and styles; helmet's default
   * CSP blocks them and the docs page renders blank. This service answers with
   * JSON, not with documents a CSP would protect.
   */
  contentSecurityPolicy: false,
  /**
   * Uploaded avatars and cover images are fetched by the web app from a
   * different origin. Helmet's default `same-origin` policy makes the browser
   * drop them.
   */
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * Rendered through the global error handler rather than replied to directly, so
 * the 429 body is byte-identical in shape to every other error this API
 * returns. The class name is what the handler turns into the `code` field.
 */
class TooManyRequestsError extends BaseError {
  readonly statusCode = 429;
  readonly isOperational = true;
}

const rateLimit = rateLimitConfig();

if (rateLimit.enabled) {
  server.register(fastifyRateLimit, {
    max: rateLimit.max,
    timeWindow: rateLimit.timeWindowMs,
    /**
     * Counting in the shared Redis makes the limit apply to the cluster; with
     * the in-memory store each replica would independently allow the full
     * budget. Falls back to in-memory when REDIS_URL is unset so a developer
     * never has to configure anything.
     */
    ...(isRedisConfigured() ? { redis: getRedis() } : {}),
    /**
     * A Redis problem must never turn into a failed request. Without this, any
     * error from the store propagates to the global error handler and the user
     * gets a 500 on a perfectly valid request — losing rate limiting is an
     * acceptable degradation, losing the API is not.
     */
    skipOnError: true,
    /**
     * The health probes must never be throttled: a 429 there reads as an
     * unhealthy container and would trigger a rollback of a perfectly good
     * deploy.
     */
    /**
     * `/health` ONLY. It is a constant-cost handler that returns a literal, so
     * exempting it is free.
     *
     * `/health/ready` is deliberately NOT exempt: it issues a Postgres
     * `select 1` and a Redis `PING`, so an unauthenticated exemption there is
     * an amplifier pointed at both datastores. It still fits comfortably inside
     * the normal limit at the container's probe interval.
     */
    allowList: (request) => request.url === "/health",
    errorResponseBuilder: (_request, context) =>
      new TooManyRequestsError(
        `Too many requests. Retry in ${context.after}.`,
      ),
  });
}

server.register(fastifyCookie);

server.register(fastifyMultipart, {
  limits: {
    files: 1,
    fileSize: 10 * 1024 * 1024,
  },
});

server.register(httpObservabilityPlugin);

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

// The interactive docs describe every route and every schema, including the
// auth ones. That is a gift to a developer and a map for anyone else, so it is
// simply not mounted in production.
if (!isProduction()) {
  server.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Crafthub v1 API",
        description: "Documentation of Crafthub v1",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Enter JWT token obtained from /auth/login endpoint",
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    },
    transform: jsonSchemaTransform,
  });

  server.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });
}

server.register(database);
server.register(routes);

let shuttingDown = false;

/**
 * Docker sends SIGTERM on every deploy and waits ~10s before SIGKILL. Without
 * this the process dies mid-request, and the last interval of metrics plus any
 * queued Sentry event is lost with it.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`Received ${signal}, shutting down`);

  try {
    // Ordered outermost-first: stop accepting requests, then tear down the
    // things a request in flight might still have been using.
    await server.close();
    await closeObservableMetrics();
    await closeRedis();
    await flushSentry();

    if (telemetryConfig().enabled) {
      // Dynamic import so a process with telemetry switched off never loads the
      // SDK or its instrumentation packages just to shut them down.
      const { shutdownTelemetry } = await import("../observability/otel.js");
      await shutdownTelemetry();
    }
  } catch (error) {
    console.error("Error during shutdown", error);
  }

  process.exit(0);
}

function registerShutdownHandlers(): void {
  // Vitest runs many app instances in one process; installing signal handlers
  // there would leak listeners and could exit the runner.
  if (isTest()) {
    return;
  }

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

const startServer = async () => {
  try {
    // Fails fast on a production boot missing a secret whose fallback would be
    // a real vulnerability. A no-op in every other environment.
    assertProductionConfig();
    initSentry();
    registerShutdownHandlers();

    const { port, host } = httpConfig();

    await server.listen({ port, host });

    // Gauges that read shared state (DAU, queue depth) attach here rather than
    // at import time, so they never observe a half-built process.
    registerObservableMetrics();

    console.log(`Server listening on http://localhost:${port}`);
    if (!isProduction()) {
      console.log(`Docs on http://localhost:${port}/docs`);
    }
  } catch (err) {
    // With `logger: false` outside production `server.log` swallows this, and a
    // boot that fails silently is the worst thing to hand a developer.
    console.error(err);
    server.log.error(err);
    process.exit(1);
  }
};

export { server, startServer };
