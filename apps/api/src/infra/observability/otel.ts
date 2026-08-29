import { NodeSDK } from "@opentelemetry/sdk-node";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { telemetryConfig } from "../config/app-config.js";

/**
 * OpenTelemetry wired to export OTLP straight to Grafana Cloud from inside the
 * Node process.
 *
 * NO COLLECTOR ON PURPOSE: the VPS has 4GB of RAM shared between Postgres,
 * Redis, the API and two workers. Running Grafana Alloy or an OTel Collector
 * container would cost a few hundred MB to move bytes we can just as well post
 * ourselves. Traces, metrics and logs all go over the same authenticated OTLP
 * channel.
 *
 * This module is only ever imported from `register.ts`, and only when
 * OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */

/**
 * Grafana Cloud authenticates OTLP with HTTP Basic where the username is the
 * stack's instance ID and the password is the access token. Building the header
 * here means the deploy only has to carry two readable secrets instead of a
 * hand-assembled base64 blob in OTEL_EXPORTER_OTLP_HEADERS — though that
 * variable still works and takes precedence if someone sets it.
 */
function buildHeaders(): Record<string, string> {
  if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    // Already configured the standard way; the exporter reads it from env.
    return {};
  }

  const instanceId = process.env.GRAFANA_CLOUD_INSTANCE_ID?.trim();
  const token = process.env.GRAFANA_CLOUD_API_TOKEN?.trim();

  if (!instanceId || !token) {
    return {};
  }

  const credentials = Buffer.from(`${instanceId}:${token}`).toString("base64");
  return { Authorization: `Basic ${credentials}` };
}

function buildResource() {
  const config = telemetryConfig();

  return defaultResource().merge(
    resourceFromAttributes({
      "service.name": config.serviceName,
      "service.namespace": config.serviceNamespace,
      "deployment.environment.name": config.deploymentEnvironment,
      // Which of the three containers this is (api / worker-embedding /
      // worker-digest). Low cardinality, and the only way to tell them apart
      // once their metrics land in the same Mimir tenant.
      "service.role": config.role,
      ...(process.env.GIT_SHA ? { "service.version": process.env.GIT_SHA } : {}),
    }),
  );
}

let sdk: NodeSDK | null = null;

export function startTelemetry(): void {
  const config = telemetryConfig();

  if (!config.enabled || sdk) {
    return;
  }

  const headers = buildHeaders();

  sdk = new NodeSDK({
    resource: buildResource(),
    traceExporter: new OTLPTraceExporter({ headers }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ headers }),
        exportIntervalMillis: config.metricExportIntervalMs,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ headers }),
      }),
    ],
    /**
     * Hand-picked rather than `auto-instrumentations-node`, which pulls in
     * AWS/GCP/Mongo/Kafka/gRPC instrumentations this app will never load. On a
     * 4GB box the resident memory those add is real and buys nothing.
     *
     * SPLIT IN TWO BY WHETHER THEY PATCH MODULES. Everything in the first
     * group rewrites a module at import time, which under ESM only works when
     * `register.ts` installed the import-in-the-middle loader hook. That hook
     * is off by default because it breaks `openai@4` — see the comment at the
     * top of `register.ts`. Registering these without it is not dangerous, just
     * dead weight: they would patch nothing and still hold memory.
     *
     *   http + fastify -> incoming request
     *   pg             -> Drizzle/postgres.js queries
     *   undici         -> the OpenAI SDK, which calls global fetch
     *   ioredis        -> BullMQ enqueue and the quota/DAU counters
     *
     * They produce SPANS. No metric on any dashboard in `infra/grafana` comes
     * from them — those are all recorded by hand in `metrics.ts` — so leaving
     * the hook off costs traces and no panels.
     *
     * RuntimeNodeInstrumentation is unconditional: it reads `perf_hooks` and
     * patches no modules, so it works either way and supplies the Node process
     * metrics the API health dashboard shows.
     */
    instrumentations: [
      new RuntimeNodeInstrumentation(),
      ...(config.esmLoaderHook
        ? [
            new HttpInstrumentation({
              // Health probes fire every few seconds from Docker and would
              // otherwise dominate the trace volume on the free tier.
              ignoreIncomingRequestHook: (request) =>
                request.url === "/health" || request.url === "/health/ready",
            }),
            new FastifyInstrumentation(),
            new PgInstrumentation(),
            new IORedisInstrumentation(),
            new UndiciInstrumentation(),
          ]
        : []),
    ],
  });

  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  const current = sdk;
  sdk = null;

  try {
    // Flushes whatever is batched. Without this a SIGTERM during a deploy drops
    // the last interval of metrics and any in-flight error traces.
    await current.shutdown();
  } catch {
    // A telemetry backend that will not accept our final flush must not hold up
    // or fail a shutdown.
  }
}
