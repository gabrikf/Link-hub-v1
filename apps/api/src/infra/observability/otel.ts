import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
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
      ...(process.env.GIT_SHA
        ? { "service.version": process.env.GIT_SHA }
        : {}),
    }),
  );
}

/**
 * The API's two health probes, matched exactly.
 *
 * Docker's HEALTHCHECK and the deploy's rollback check hit these every few
 * seconds, which makes them the highest-volume and least interesting traffic
 * this process ever sees. They are registered once each, at these paths only —
 * `routes/index.ts` deliberately leaves them out of the `/api/v1` block that
 * mounts every other module twice — so an exact set is a complete match, not an
 * approximation.
 *
 * WHY NOT THE OTHER TWO FORMS `@fastify/otel` OFFERS. It also accepts a glob
 * string, and falls back to reading OTEL_FASTIFY_IGNORE_PATHS when no option is
 * passed. A glob is a deploy-time footgun: `/health*` would silently swallow a
 * future `/health-admin` route, and a typo in the env var fails open with no
 * error and no log. This function is exact, lives beside the paths it names,
 * and moves with them in the same commit. Passing the option also wins over the
 * env var outright — `@fastify/otel` reads it only when no option is given — so
 * nobody can widen or break this suppression from a deploy. And the deploy
 * carries no new variable, so `turbo.json`'s `globalPassThroughEnv` does not
 * have to grow one.
 */
const HEALTH_PROBE_PATHS = new Set(["/health", "/health/ready"]);

function isHealthProbe({ url }: { url: string }): boolean {
  // `@fastify/otel` calls this from its `onRoute` hook with the route template
  // and from its `onRequest` hook with the raw request URL, which may carry a
  // query string. Compare the path portion so both call sites agree.
  const queryStart = url.indexOf("?");
  return HEALTH_PROBE_PATHS.has(
    queryStart === -1 ? url : url.slice(0, queryStart),
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
     *   http           -> incoming request
     *   fastify        -> the route, its handler and its lifecycle hooks.
     *                     `@fastify/otel` is the exception in this group: it
     *                     patches no module and needs no hook. See the note on
     *                     it below for why it is gated here anyway.
     *   undici         -> the OpenAI SDK, which calls global fetch
     *   ioredis        -> BullMQ enqueue and the quota/DAU counters
     *   pino           -> THE ONLY SOURCE OF LOGS. The SDK below configures an
     *                     OTLP log exporter, but the app logs through pino
     *                     straight to stdout and pino does not know the
     *                     OpenTelemetry logs API exists. Without this bridge the
     *                     log pipeline is fully wired, authenticated, and fed by
     *                     nothing — which is exactly what it was until now: Loki
     *                     held zero streams while metrics flowed fine. It also
     *                     stamps trace_id/span_id onto each line, which is what
     *                     makes a log jump to its trace.
     *
     * They produce SPANS. No metric on any dashboard in `infra/grafana` comes
     * from them — those are all recorded by hand in `metrics.ts` — so leaving
     * the hook off costs traces and no panels.
     *
     * NOTHING HERE TRACES THE DATABASE, AND NOTHING EVER DID. Until 2026-09-05
     * this list also held `@opentelemetry/instrumentation-pg`, annotated
     * "pg -> Drizzle/postgres.js queries". That annotation was false and cost
     * someone a wrong assumption every time they read it.
     * `@opentelemetry/instrumentation-pg` patches the modules `pg` and
     * `pg-pool` — node-postgres. This app reaches Postgres through
     * `postgres.js` (`drizzle-orm/postgres-js` in
     * `src/infra/database/drizzle/index.ts`), and neither the built app nor
     * drizzle's postgres-js driver imports `pg` anywhere, so the
     * instrumentation matched no module, patched nothing and emitted nothing.
     * `pg` is in fact only a devDependency here, and the production image is
     * built with `npm ci --omit=dev` — so in production the module it wanted
     * to patch was never even on disk.
     * Measured, not assumed: booted through the production entrypoint with
     * OTEL_ESM_LOADER_HOOK=true against a local OTLP sink, `/health/ready` ran
     * `select 1` and answered 200, http/ioredis/fastify spans all arrived, and
     * zero pg spans did. It was dropped rather than left standing as a
     * reassurance the trace data does not support.
     *
     * SO A SLOW QUERY IS INVISIBLE. It shows up only as unexplained time
     * inside the fastify handler span, with nothing underneath it. Do not read
     * a gap there as "the database is fine". There is no drop-in fix waiting:
     * drizzle 0.44/0.45 ship a `tracer.startActiveSpan` around every query but
     * never assign the `otel` binding it guards on, so those spans are dead
     * code in the published build, and its `Logger.logQuery` hook fires at
     * query start only — no completion, no duration, so no span can be closed
     * from it. Adding DB spans means wrapping the `postgres()` client by hand
     * (or with the third-party `otel-instrumentation-postgres`), which is a
     * deliberate change with its own review, not something this file can
     * import its way into.
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
            /**
             * `@fastify/otel`, not `@opentelemetry/instrumentation-fastify` —
             * the latter is deprecated in favour of this one, which Fastify
             * maintains.
             *
             * `registerOnInitialization` is what keeps this a one-line swap.
             * The package is normally a Fastify PLUGIN you `register()` on the
             * instance, but with this flag it subscribes to the
             * `fastify.initialization` diagnostics_channel that Fastify 5
             * publishes and registers itself on every instance the process
             * creates — so `server.ts` does not have to know it exists, and
             * the two worker entrypoints, which never build a Fastify
             * instance, keep paying nothing.
             *
             * IT IS IN THE HOOK-GATED GROUP ON PURPOSE, EVEN THOUGH IT DOES
             * NOT NEED THE HOOK. Its `init()` returns no module definitions;
             * it patches nothing and would work with `esmLoaderHook` off. It
             * stays here so this switch keeps meaning exactly what it means
             * today — with the hook off, no request spans — instead of
             * silently starting to emit parentless `request` spans into Tempo
             * on the next deploy. Moving it out is a deliberate observability
             * change, not a lint fix.
             */
            /**
             * `ignorePaths` AND `instrumentHooks` ARE QUOTA GUARDS, LANDED
             * DELIBERATELY AHEAD OF ANY DECISION TO UNGATE THIS. Neither does
             * anything today — with `esmLoaderHook` off this whole array is
             * never constructed — and that is exactly why they belong here now
             * rather than in the change that flips the switch, where they are
             * the step everyone forgets.
             *
             * `ignorePaths` — `@fastify/otel` has its own ignore list and does
             * NOT inherit the one on `HttpInstrumentation` above. Today that
             * costs nothing, because when `ignoreIncomingRequestHook` returns
             * true the http instrumentation runs the rest of the request under
             * `suppressTracing()`, which suppresses fastify's spans along with
             * its own. But that only holds while the two are switched on
             * together. Move fastify out of this gate — the obvious next step,
             * since it needs no hook — and the http instrumentation is no
             * longer there to suppress anything, so every health probe starts
             * producing a full set of spans. Measured on this branch, hook off
             * and fastify ungated: 9.00 spans and ~5.85 KB of OTLP JSON per
             * probe, against a Grafana Cloud free tier, forever. With this
             * option: zero.
             *
             * `instrumentHooks: false` — the default wraps every lifecycle hook
             * of every route in its own span: onRequest for cors, two for
             * helmet, one for cookies, onSend, two onResponse. Measured on a
             * real route that is 9 spans per request, of which 7 are framework
             * plumbing nobody has ever debugged from a waterfall. Off, a
             * request is the root `request` span plus `handler - <plugin>` —
             * 2 spans, a 78% reduction, and the shape you actually read.
             * Per-route opt-in survives: a route can set
             * `config: { otel: { instrumentHooks: true } }` when its hooks are
             * genuinely the thing under investigation.
             */
            new FastifyOtelInstrumentation({
              registerOnInitialization: true,
              ignorePaths: isHealthProbe,
              instrumentHooks: false,
            }),
            new IORedisInstrumentation(),
            new UndiciInstrumentation(),
            new PinoInstrumentation(),
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
