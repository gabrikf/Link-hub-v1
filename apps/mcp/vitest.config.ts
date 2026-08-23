import { defineConfig } from "vitest/config";

// No setup file and no environment beyond node. Nothing in this package may
// touch the network during a test: `api-client.ts` is exercised against a
// stubbed `fetch`, and every tool is driven through its own handler with a fake
// client. A test here that opens a socket is a bug in the test.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],

    // ── Coverage ratchet ───────────────────────────────────────────────────
    // This package had ZERO tests until the characterization suite landed; the
    // floors below are deliberately set under the first measured baseline for
    // the same reason apps/api's are (see apps/api/vitest.config.ts). They may
    // only ever go UP, and the target is 70 across the board.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 40,
        branches: 60,
        functions: 40,
        lines: 40,
      },
    },
  },
});
