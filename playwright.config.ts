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
  webServer: [
    {
      command: "npm run dev:api",
      url: `${API}/docs`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev:web",
      url: WEB,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
