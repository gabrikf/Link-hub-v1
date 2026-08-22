/**
 * Passed to Node as `--import ./dist/infra/observability/register.js` by the
 * three production start scripts. It runs to completion *before* the entry
 * module is loaded, which is the only point at which instrumentation can patch
 * anything.
 *
 * WHY THE LOADER HOOK IS NOT OPTIONAL: `apps/api` is `"type": "module"` and
 * compiles to ESM. OpenTelemetry's auto-instrumentation patches modules by
 * intercepting the loader, and the CommonJS interception it uses by default
 * never sees an ESM `import`. Without registering the hook below you get a
 * process that starts cleanly, reports no errors, and produces no spans — the
 * classic silent failure. `module.register()` needs Node >= 20.6; this repo is
 * on Node 22.
 *
 * WHY EVERYTHING IS GUARDED: with no OTEL_EXPORTER_OTLP_ENDPOINT this file
 * returns before touching anything, so a developer who never sets a telemetry
 * variable pays nothing and sees nothing. And because a broken telemetry setup
 * must never be the reason the API fails to boot, every step is wrapped — the
 * worst case is a warning on stderr and an app that runs untraced.
 *
 * Local development does not go through this file at all: `npm run dev` uses
 * `tsx watch src/index.ts` with no `--import`.
 */

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  try {
    const { register } = await import("node:module");

    // The only loader hook OpenTelemetry supports. It wraps
    // import-in-the-middle so ESM imports become patchable.
    register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

    const { startTelemetry } = await import("./otel.js");
    startTelemetry();
  } catch (error) {
    console.warn(
      "[telemetry] disabled: failed to initialise OpenTelemetry",
      error instanceof Error ? error.message : error,
    );
  }
}
