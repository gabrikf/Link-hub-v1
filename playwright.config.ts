import { defineConfig, devices } from "@playwright/test";

/**
 * The e2e contract for LinkHub's five load-bearing journeys.
 *
 * WHY THIS EXISTS ALONGSIDE `scripts/visual/run.mjs`: the visual runner is a
 * *camera* — it walks a screen's four states and fails on console errors so a
 * human can look at the result. It is not a test runner and it has no assertion
 * report, no retries, no per-journey isolation. This config is the *gate*: one
 * `npx playwright test` that either passes or names the journey that broke.
 *
 * Servers are NOT started here by default. The nightly loop owns long-lived
 * api/web processes and restarting them per run would cost minutes per
 * iteration, so `reuseExistingServer` is always on and the commands below are
 * only a fallback for a human running the suite on a cold machine.
 */
const WEB = process.env.E2E_WEB_URL || "http://localhost:5173";
const API = process.env.E2E_API_URL || "http://localhost:3333";

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".playwright/e2e-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: ".playwright/e2e-report.json" }],
    ["html", { outputFolder: ".playwright/e2e-html", open: "never" }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB,
    testIdAttribute: "data-testid",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "setup", testMatch: /support\/auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
      // Responsive is a real bug class here; only journeys tagged @responsive
      // pay the second run.
      grep: /@responsive/,
    },
  ],
  /**
   * The fallback servers must come up on the SAME ports the tests target.
   * Hardcoding `npm run dev:api` starts it on its default 3333, and if another
   * project owns 3333 the run dies with EADDRINUSE while the real api sits
   * healthy on the configured port. Derive the ports from the URLs instead.
   *
   * `WEB_APP_URL` is required because the api's dev CORS allowlist names 5173
   * and 4173 literally, so a web on any other port is blocked without it.
   * The vite `--port` flag is needed because vite.config.ts hardcodes 5173, and
   * it must be forwarded through the workspace script with `--`, not through
   * the root `dev:web` alias, which would swallow it as an npm flag.
   */
  webServer: [
    {
      command: `PORT=${new URL(API).port} WEB_APP_URL=${WEB} npm run dev --workspace=api`,
      url: `${API}/docs`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `VITE_API_URL=${API} npm run dev --workspace=web -- --port ${new URL(WEB).port} --strictPort`,
      url: WEB,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
