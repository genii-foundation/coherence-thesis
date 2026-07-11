import { defineConfig, devices } from "@playwright/test";

const fastE2e = process.env.PLAYWRIGHT_FAST === "1";
const isCI = !!process.env.CI;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (fastE2e ? "http://127.0.0.1:3200" : "http://127.0.0.1:3100");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Fail the run if a `test.only` was committed, and retry flaky tests on CI.
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: fastE2e
      ? "npm run dev:e2e"
      : "npm run build && npm run preview:production",
    url: baseURL,
    reuseExistingServer: fastE2e,
    // The full-mode server runs a production build (manuscript compile, PDF
    // generation, next build) before serving, which exceeds two minutes on CI.
    timeout: 600000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 15"] },
    },
    {
      name: "webkit-cover-flow",
      testMatch: /cover-flow\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
