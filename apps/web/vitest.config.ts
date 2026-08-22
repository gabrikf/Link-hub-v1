import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config kept separate from vite.config.ts so the Tailwind plugin
// (which isn't needed for unit tests) stays out of the test pipeline.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],

    // ── Coverage ratchet ───────────────────────────────────────────────────
    // Measured baseline (47 test files):
    //
    //     statements 57.34%   branches 77.86%   functions 60.12%   lines 57.34%
    //
    // Floors sit a couple of points under it so ordinary churn does not fail a
    // push. They may only go UP; raise them in the same commit that raises
    // coverage. TARGET IS 70 — see docs/coverage.md.
    //
    // A note on what these numbers do NOT measure: a React component can be
    // 100% covered by a test that renders it and asserts nothing. Coverage here
    // is a flashlight for finding untouched files, not evidence of correctness.
    // The real sensors for this workspace are the four-state visual scenarios
    // and `.parse()` assertions against @repo/schemas.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 55,
        branches: 75,
        functions: 57,
        lines: 55,
      },
    },
  },
});
