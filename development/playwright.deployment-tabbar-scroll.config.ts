import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the `.tab-bar` narrow-viewport overflow bug (2026-08-15, owner
 * UI/UX pass on the Deployment panel). A dedicated config, following `playwright.admin-fab.config
 * .ts`'s precedent exactly (same two-process boot: the API on its own port with `TOVU_DB=memory`,
 * then Vite for `apps/admin` on a second port with `TOVU_API_URL` pointed at the first) — this
 * bug only reproduces against a live Vite dev-mode render at a real narrow viewport, not a build
 * artifact or a unit test (layout overflow is not observable through jsdom).
 *
 * Ports 7871/7872/7873: confirmed free via `lsof` on 2026-08-15 against every other config's own
 * documented reservation (nearest neighbors: 7861-3 theme-liquid-preview, 7921-3 visual-parity).
 */
const API_PORT = 7871;
const ADMIN_PORT = 7872;
const DAEMON_PORT = 7873;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /deployment-tabbar-scroll\.spec\.ts/,
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
