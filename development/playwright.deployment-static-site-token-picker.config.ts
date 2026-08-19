import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Config for the Static Site tab's "which saved token publishes" picker (`CredentialTokenPicker`,
 * `StaticSiteTab.tsx`) — the owner's own original ask, per `use-publish-credentials.hooks.ts`'s
 * `credentialsForProvider` doc: "GitHub pages... will have a dropdown where you can choose which
 * GitHub access tokens". Same two-process boot shape as
 * `playwright.deployment-static-site-verify-gap.config.ts` (its sibling gap, closed the same pass) —
 * this is about what the real rendered tree does with TWO saved credentials for one provider, which a
 * unit test's jsdom render already covers for the picker's own gating logic
 * (`StaticSiteTab.unit.test.tsx`) but not the real `selectCredential` PUT round-trip this file proves.
 *
 * Ports 7961/7962/7963: confirmed free via `lsof` on 2026-08-16 against every other config's own
 * documented reservation (nearest neighbors: 7951-3, `playwright.live-publish-e2e.config.ts`).
 */
const API_PORT = 7961;
const ADMIN_PORT = 7962;
const DAEMON_PORT = 7963;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /deployment-static-site-token-picker\.spec\.ts/,
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
