import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests against a production build in mock mode.
 *
 * Build first (`npm run build` at the repo root, with PAPERS_API_URL=http://localhost:8788 so the
 * CSP lets pages call the local papers Worker), then `npm run test:e2e`.
 * Locally, set PW_CHANNEL=msedge (or chrome) to use an installed browser
 * instead of downloading Playwright's bundled Chromium.
 */
const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;
const PAPERS_PORT = 8788;
const PAPERS_URL = `http://localhost:${PAPERS_PORT}`;
const PAPERS_KEY = "e2e-only-papers-key-0123456789abcdef";
/** The register number e2e/papers.spec.ts signs in with to review papers (keep the two in step). */
const PAPERS_ADMIN = "41119999";
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
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      cwd: __dirname,
      url: `${baseURL}/login`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        DATA_SOURCE: "mock",
        SESSION_SECRET: "e2e-only-secret-0123456789abcdefghijklmnop",
        NODE_ENV: "production",
        PAPERS_API_URL: PAPERS_URL,
        PAPERS_SIGNING_KEY: PAPERS_KEY,
        PAPERS_ADMINS: PAPERS_ADMIN,
      },
    },
    {
      // The question papers Worker (workers/papers) on local D1/KV, from an empty state each run.
      // The build must have PAPERS_API_URL set to the same address so the CSP allows it.
      command: [
        `node -e "require('fs').rmSync('.wrangler/e2e',{recursive:true,force:true})"`,
        `npx --yes wrangler@4.152.0 d1 migrations apply sistmate-papers --local --persist-to .wrangler/e2e`,
        `npx --yes wrangler@4.152.0 dev --local --port ${PAPERS_PORT} --persist-to .wrangler/e2e --var ALLOWED_ORIGINS:${baseURL} --var PAPERS_SIGNING_KEY:${PAPERS_KEY}`,
      ].join(" && "),
      cwd: `${__dirname}/../../workers/papers`,
      url: `${PAPERS_URL}/`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
});
