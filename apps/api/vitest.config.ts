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
  },
});
