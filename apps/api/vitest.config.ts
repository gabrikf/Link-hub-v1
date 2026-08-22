import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Ensure .env is loaded before any module is imported (including server.ts,
    // which calls setupContainer() at module load time and reads process.env)
    setupFiles: ["./src/test-setup.ts"],
    // E2E tests hit real DB + OpenAI — allow generous timeouts
    testTimeout: 60_000,
    hookTimeout: 90_000,

    // ── Coverage ratchet ───────────────────────────────────────────────────
    // Measured baseline on 101 test files / 832 tests, with docker up and the
    // three OpenAI-dependent files excluded (the same scope CI runs):
    //
    //     statements 55.31%   branches 89.36%   functions 67.79%   lines 55.31%
    //
    // The thresholds below sit a few points UNDER that, which is deliberate and
    // is not slack: the gate legitimately skips three Postgres-bound files when
    // docker is down, and a skipped file lowers coverage. A floor set exactly at
    // the baseline would make the gate fail for a reason that has nothing to do
    // with the change being pushed — and a gate that fails for unrelated reasons
    // is a gate people start bypassing.
    //
    // These numbers may only ever go UP. When you raise coverage, raise the
    // floor in the same commit to lock the improvement in. TARGET IS 70 across
    // the board; see docs/coverage.md for why it is a ratchet and not a cliff.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 50,
        branches: 85,
        functions: 62,
        lines: 50,
      },
    },
  },
});
