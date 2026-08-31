import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Config for `multi-tab-resource-soak.spec.ts` — the generalized, multi-screen version of
 * `playwright.themes-presentation-timeout.config.ts`. Follows that config's precedent exactly:
 * hermetic two-process boot (`TOVU_DB=memory` API + Vite admin, each on its own port), `workers: 1`,
 * `reuseExistingServer: false`, `timeout: 100_000` (past the real 60s `lib/api.ts` request-timeout
 * window the spec deliberately waits out per screen).
 *
 * Ports 8001/8002/8003: unused by every other config in this directory as of 2026-08-17 (checked
 * against every `_PORT = ` constant across `development/playwright.*.config.ts` — highest prior
 * neighbor is 7991-3, `playwright.themes-presentation-timeout.config.ts`).
 */
const API_PORT = 8001;
const ADMIN_PORT = 8002;
const DAEMON_PORT = 8003;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /multi-tab-resource-soak\.spec\.ts/,
  timeout: 100_000,
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
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
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
