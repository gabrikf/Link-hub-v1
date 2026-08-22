import { defineConfig } from "vitest/config";

// No setup file and no environment beyond node: this package is pure zod
// schemas with no I/O, no framework and no globals to bootstrap.
export default defineConfig({
  test: {
    environment: "node",

    // ── Coverage ratchet ─────────────────────────────────────────────────────
    // Measured baseline (6 test files):
    //
    //     statements 41.12%   branches 81.57%   functions 77.77%   lines 41.12%
    //
    // The lowest floor in the repo, and the one that matters most to raise.
    // This is THE contract package — api, web, mcp, extractor and training all
    // type against it — so an unexercised schema is a shape nobody has ever
    // confirmed round-trips. The high-value tests are not "does zod work" but
    // `schema.parse(realPayloadCapturedFromTheRunningApi)`: that is what turns
    // contract drift into a failing test instead of a production bug.
    //
    // Floors may only go UP. TARGET IS 70 — see docs/coverage.md.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 39,
        branches: 79,
        functions: 74,
        lines: 39,
      },
    },
  },
});
