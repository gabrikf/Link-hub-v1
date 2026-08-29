import { defineConfig } from "vitest/config";

// No setup file and no environment beyond node. Nothing in this package may
// touch the network during a test: `fetch` is stubbed per test file, and the
// MCP server is driven through an in-memory fake host rather than over stdio.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],

    // ── Coverage ratchet ───────────────────────────────────────────────────
    // See docs/coverage.md. This package had NO tests and no coverage config at
    // all. Measured baseline for the characterization suite that lands with
    // this config: statements 95.56, branches 99.2, functions 100, lines 95.56.
    // The floors sit a few points under that, the same margin the other
    // workspaces use. Floors may only ever go UP.
    //
    // The entire gap is `src/index.ts` (45 statements, 0%) — the stdio
    // bootstrap that constructs the transport and connects it. Covering it
    // means spawning the process, which belongs in an e2e, not here.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 92,
        branches: 96,
        functions: 97,
        lines: 92,
      },
    },
  },
});
