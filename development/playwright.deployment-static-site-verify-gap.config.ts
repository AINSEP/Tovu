import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the "no Verify control" gap found live (QA/E2E verification pass,
 * 2026-08-16, `ADS-memory/reports/verification/2026-08-16-live-publish-through-assistant.md`).
 * Follows `playwright.deployment-tabbar-scroll.config.ts`'s own precedent exactly: a dedicated
 * two-process boot (API with `TOVU_DB=memory` on its own port, then Vite for `apps/admin` pointed
 * at it) — this bug is about what `StaticSiteTab.tsx` actually renders for a saved credential, not
 * observable through a unit test's jsdom render alone (the assertion cares about `getByRole`
 * reachability across the real rendered tree, and the API round-trip that seeds the credential).
 *
 * Ports 7941/7942/7943: confirmed free via `lsof` on 2026-08-16 against every other config's own
 * documented reservation (nearest neighbors: 7931-3 — see that config's own comment for its name).
 */
const API_PORT = 7941;
const ADMIN_PORT = 7942;
const DAEMON_PORT = 7943;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /deployment-static-site-verify-gap\.spec\.ts/,
  timeout: 30_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
