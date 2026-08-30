/**
 * Passed to Node as `--import ./dist/infra/observability/register.js` by the
 * three production start scripts. It runs to completion *before* the entry
 * module is loaded, which is the only point at which instrumentation can patch
 * anything.
 *
 * ---------------------------------------------------------------------------
 * THE ESM LOADER HOOK IS OPT-IN AND DEFAULTS TO OFF. Read this before setting
 * OTEL_ESM_LOADER_HOOK=true.
 * ---------------------------------------------------------------------------
 * `@opentelemetry/instrumentation/hook.mjs` installs import-in-the-middle,
 * which intercepts EVERY ESM import in the process rather than only the ones an
 * instrumentation asked to patch. `openai@4` resolves its runtime through the
 * `_shims` subsystem at module-evaluation time, and under IITM that module ends
 * up evaluated twice: the second `init()` finds shims already set and throws
 *
 *   Error: you must `import 'openai/shims/node'` before importing anything else
 *          from openai
 *
 * at load time, before a single handler runs. On 2026-08-29 that put the
 * production API into a crash-loop the moment OTEL_EXPORTER_OTLP_ENDPOINT was
 * first set — six minutes of 503 from a change that only added an env var.
 *
 * WHAT LEAVING IT OFF COSTS: distributed traces, and nothing else. The five
 * instrumentations that need module patching (http, fastify, pg, ioredis,
 * undici) produce spans. Every metric the dashboards in `infra/grafana` query
 * is recorded by hand in `metrics.ts`, and RuntimeNodeInstrumentation reads
 * `perf_hooks` instead of patching modules — so the dashboards and the runtime
 * metrics are unaffected by this switch.
 *
 * `openai` v5 deleted `_shims`, and this repo is now on v7, so the original
 * crash is gone. This was verified properly rather than assumed: the built app
 * was booted through this exact entrypoint with the hook on, against the real
 * Grafana Cloud endpoint under the service name `crafthub-api-preflight`, and
 * both signals landed — spans in Tempo, pino records in Loki.
 *
 * The default is STILL false. Not from doubt about the above, but because an
 * env var is revertible in thirty seconds while a bad default needs a deploy —
 * and because the incident it guards against was hard to diagnose precisely
 * because the hook and telemetry were switched on in the same breath. Turn it
 * on by itself. `app-config.test.ts` pins the default so nobody flips it here
 * by accident.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TRY/CATCH BELOW IS NOT THE SAFETY NET IT LOOKS LIKE
 * ---------------------------------------------------------------------------
 * It guards the *registration*. The hook it installs changes how every
 * subsequent import in the process behaves, and that failure surfaces long
 * after this block has already returned successfully. An earlier version of
 * this comment promised that a broken telemetry setup could never be the reason
 * the API failed to boot. That promise was false, and production is what
 * proved it.
 *
 * WHY EVERYTHING IS STILL GUARDED: with no OTEL_EXPORTER_OTLP_ENDPOINT this
 * file returns before touching anything, so a developer who never sets a
 * telemetry variable pays nothing and sees nothing.
 *
 * `module.register()` needs Node >= 20.6; this repo is on Node 22.
 *
 * Local development does not go through this file at all: `npm run dev` uses
 * `tsx watch src/index.ts` with no `--import`.
 */

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  try {
    /**
     * Raw `process.env`, not `telemetryConfig()`. Reading the config module
     * here would load app-config and everything it imports *before* the hook
     * could patch them, which is the one ordering this file exists to control.
     * `otel.ts` reads the same variable via `telemetryConfig().esmLoaderHook`;
     * the two must agree, which is what the test in `app-config.test.ts` pins.
     */
    if (process.env.OTEL_ESM_LOADER_HOOK === "true") {
      const { register } = await import("node:module");
      register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
    }

    const { startTelemetry } = await import("./otel.js");
    startTelemetry();
  } catch (error) {
    console.warn(
      "[telemetry] disabled: failed to initialise OpenTelemetry",
      error instanceof Error ? error.message : error,
    );
  }
}
