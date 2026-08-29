import { afterEach, describe, expect, it, vi } from "vitest";
import { sentryConfig, telemetryConfig } from "./app-config.js";

/**
 * `telemetryConfig()` is a function rather than a constant precisely so it can
 * be read after `vi.stubEnv`, which is what makes these assertions possible.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("telemetryConfig", () => {
  describe("the on switch", () => {
    it("is off when OTEL_EXPORTER_OTLP_ENDPOINT is absent", () => {
      vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", undefined);

      expect(telemetryConfig().enabled).toBe(false);
    });

    /**
     * `.env.production` ships the key present but empty, which is how telemetry
     * stayed off in production for months. `readString` trims to undefined, and
     * `register.ts` tests truthiness — both agree that empty means off. If
     * either ever stopped agreeing, an empty value would half-start the SDK.
     */
    it("is off when OTEL_EXPORTER_OTLP_ENDPOINT is present but empty", () => {
      vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");

      expect(telemetryConfig().enabled).toBe(false);
    });

    it("is off when the endpoint is only whitespace", () => {
      vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "   ");

      expect(telemetryConfig().enabled).toBe(false);
    });

    it("is on once an endpoint is set", () => {
      vi.stubEnv(
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "https://otlp-gateway-prod-eu-west-2.grafana.net/otlp",
      );

      expect(telemetryConfig().enabled).toBe(true);
    });
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * The ESM loader hook installs import-in-the-middle, which intercepts every
   * ESM import and makes `openai@4` throw during its own `_shims` init. On
   * 2026-08-29 flipping this on crash-looped the production API at boot. Until
   * this repo is on `openai` v5, the default must stay false — a change of
   * default here is an outage, not a preference.
   */
  describe("esmLoaderHook", () => {
    it("defaults to false when OTEL_ESM_LOADER_HOOK is unset", () => {
      vi.stubEnv("OTEL_ESM_LOADER_HOOK", undefined);

      expect(telemetryConfig().esmLoaderHook).toBe(false);
    });

    it("stays false for anything that is not an explicit opt-in", () => {
      for (const value of ["", "false", "0", "no", "  "]) {
        vi.stubEnv("OTEL_ESM_LOADER_HOOK", value);

        expect(telemetryConfig().esmLoaderHook).toBe(false);
      }
    });

    it("is true only when explicitly opted in", () => {
      vi.stubEnv("OTEL_ESM_LOADER_HOOK", "true");

      expect(telemetryConfig().esmLoaderHook).toBe(true);
    });
  });
});

describe("sentryConfig", () => {
  /**
   * `sentry.ts` OMITS `tracesSampleRate` rather than passing 0, because Sentry
   * v10 reads "defined" as "tracing on" and would then layer its own
   * http/fastify/pg/ioredis instrumentation on top of OpenTelemetry's. That
   * branch is only reachable while the default here is 0 — `.env.example`
   * suggests 0.1, so this pins the default rather than the example.
   */
  it("defaults tracesSampleRate to 0 so OpenTelemetry stays the only tracer", () => {
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", undefined);

    expect(sentryConfig().tracesSampleRate).toBe(0);
  });

  it("is off without a DSN", () => {
    vi.stubEnv("SENTRY_DSN", undefined);

    expect(sentryConfig().enabled).toBe(false);
  });
});
