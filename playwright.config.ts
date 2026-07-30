import { defineConfig, devices } from "@playwright/test";
import {
  resolveFastE2eBaseUrl,
  resolvePlaywrightServerMode,
} from "./scripts/dev/playwright-server-mode";

const serverMode = resolvePlaywrightServerMode(process.env);
const fastE2e = serverMode === "fast";
const prebuiltE2e = serverMode === "prebuilt";
const isCI = !!process.env.CI;
// Fast mode derives its port from this checkout so concurrent worktrees never
// share one development server. See scripts/dev/playwright-server-mode.ts.
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (fastE2e ? resolveFastE2eBaseUrl() : "http://127.0.0.1:3100");

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
    // The offline service worker is a production feature no reader-behavior
    // test needs, and letting it install puts a second caching layer plus
    // controller changes underneath every navigation. progress.spec.ts blocked
    // it locally to keep WebKit requests visible to Playwright routing; the
    // same interference showed up as WebKit navigation instability elsewhere,
    // so the whole suite now answers from the development server only.
    serviceWorkers: "block",
  },
  webServer: {
    command: fastE2e
      ? "npm run dev:e2e"
      : prebuiltE2e
        ? "npm --ignore-scripts run preview:production"
        : "npm run build && npm run preview:production",
    url: baseURL,
    reuseExistingServer: fastE2e,
    // Standalone full mode can build before serving. Prebuilt mode reuses the
    // validated build, but keeps this ceiling for slower CI startup.
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
