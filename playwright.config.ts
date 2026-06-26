import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration.
 * Critical flows to cover (per design): guest submit, BD review/approve, sign-in, locale switch
 * Full test suite added in Phase 9 (Task 9.6 — E2E smoke).
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.{ts,tsx}",

  /* Run tests in parallel */
  fullyParallel: true,
  /* Fail the build on CI if test.only is present */
  forbidOnly: !!process.env["CI"],
  /* Retry on CI only */
  retries: process.env["CI"] ? 2 : 0,
  /* Opt out of parallel tests on CI */
  workers: process.env["CI"] ? 1 : undefined,

  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    process.env["CI"] ? ["github"] : ["list"],
  ],

  use: {
    /* Base URL — uses local dev server in dev, configurable for CI */
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    /* Collect trace on first retry */
    trace: "on-first-retry",
    /* Screenshot on failure */
    screenshot: "only-on-failure",
    /* Video on first retry */
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  /* Start the dev server before running E2E tests */
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
