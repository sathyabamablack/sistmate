import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against a production build in mock mode.
 *
 * Build first (`npm run build` at the repo root), then `npm run test:e2e`.
 * Locally, set PW_CHANNEL=msedge (or chrome) to use an installed browser
 * instead of downloading Playwright's bundled Chromium.
 */
const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // The PWA service worker precaches assets and proxies navigations, which
    // makes "network idle" and navigation timing nondeterministic under
    // parallel load. Block it by default; PW_SW=allow runs the suite with it.
    serviceWorkers: process.env.PW_SW === "allow" ? "allow" : "block",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        channel,
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: __dirname,
    url: `${baseURL}/login`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      DATA_SOURCE: "mock",
      SESSION_SECRET: "e2e-only-secret-0123456789abcdefghijklmnop",
      NODE_ENV: "production",
    },
  },
});
