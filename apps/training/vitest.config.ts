import { defineConfig } from "vitest/config";

// NOTE: this workspace pins vitest 4.x while every other workspace is on 3.x,
// so it also carries its own `@vitest/coverage-v8` at a matching major. The
// provider package must track the vitest major or coverage fails to load.
// Converging on one vitest version across the monorepo is worth doing; it is
// its own task, not a side effect of this one.
export default defineConfig({
  test: {
    environment: "node",

    // ── Coverage ratchet ─────────────────────────────────────────────────────
    // Measured baseline (9 test files):
    //
    //     statements 99.01%   branches 86.54%   functions 100%   lines 98.96%
    //
    // Effectively fully covered, which is appropriate: this is an offline
    // trainer whose output is a model file that silently changes recruiter
    // "AI Match %" scores in production. A regression here does not throw — it
    // just ranks the wrong candidates higher, which nothing else in the system
    // would notice. Keep it near 100.
    //
    // Worth saying explicitly: high coverage here does NOT mean the model is
    // good. Coverage proves the training code ran; whether the model ranks well
    // is an evaluation question, and the answer belongs in an eval suite with
    // held-out data, not in these numbers.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 95,
        branches: 84,
        functions: 98,
        lines: 95,
      },
    },
  },
});
