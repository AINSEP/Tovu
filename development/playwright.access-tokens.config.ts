import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Dedicated config for the Security page's Access Tokens tab (`/admin/access-tokens`) —
 * follows `playwright.deployment-tabbar-scroll.config.ts`'s precedent exactly (two-process boot: the
 * API on its own port with `TOVU_DB=memory`, Vite for `apps/admin` on a second port with
 * `TOVU_API_URL` pointed at the first). A fresh in-memory DB per run matters here specifically: this
 * suite creates/replaces/removes real rows in `publish_credential_sets`/
 * `source_control_credential_sets`, and must never run against a persisted DB an operator is using.
 *
 * Ports 7931/7932/7933: confirmed free via `lsof` on 2026-08-16 against every other config's own
 * documented reservation (nearest neighbors: 7921-3 visual-parity, 7871-3 deployment-tabbar-scroll).
 */
const API_PORT = 7931;
const ADMIN_PORT = 7932;
const DAEMON_PORT = 7933;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /access-tokens\.spec\.ts/,
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
