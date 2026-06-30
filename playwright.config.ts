import { defineConfig, devices } from "@playwright/test";

const fastE2e = process.env.PLAYWRIGHT_FAST === "1";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (fastE2e ? "http://127.0.0.1:3200" : "http://127.0.0.1:3100");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
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
    timeout: 120000,
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
  ],
});
