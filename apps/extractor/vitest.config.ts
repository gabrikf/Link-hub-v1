import { defineConfig } from "vitest/config";

// No setup file and no environment beyond node: every test here is either pure
// (hashing, technology inference) or drives a throwaway git repo in a temp dir.
// Nothing in this package may touch the network or this repository's own
// history, so there is deliberately nothing to bootstrap.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Creating and committing to real temp git repos is slower than a unit test
    // but far cheaper than mocking git badly.
    testTimeout: 30_000,

    // ── Coverage ratchet ───────────────────────────────────────────────────
    // Measured baseline (6 test files):
    //
    //     statements 85.89%   branches 77.68%   functions 97.56%   lines 85.89%
    //
    // The best-covered app in the repo, and it should stay that way: this
    // package decides what leaves a developer's machine, so an untested branch
    // here is a privacy question, not a code-quality one. Floors may only go UP.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 83,
        branches: 75,
        functions: 94,
        lines: 83,
      },
    },
  },
});
