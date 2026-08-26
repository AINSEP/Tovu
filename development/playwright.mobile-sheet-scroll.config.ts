import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the mobile chat sheet blocking scroll to the bottom of the page
 * (owner repro, 2026-08-26). Same two-process boot as `playwright.admin-shell-scroll.config.ts`
 * and `playwright.deployment-tabbar-scroll.config.ts`: the API on its own port with
 * `TOVU_DB=memory`, then Vite for `apps/admin` on a second port pointed at it. A dedicated config
 * rather than a `testMatch` bolted onto a sibling — `e2e/` is shared by two dozen configs, and an
 * unscoped one silently adopts every new spec that lands there (see `playwright.config.ts`'s own
 * comment on that failure mode).
 *
 * Ports 8071/8072/8073: confirmed free via `lsof` on 2026-08-26 against every other config's own
 * documented reservation (the block above, 8061-3, is the last one taken).
 */
const API_PORT = 8071;
const ADMIN_PORT = 8072;
const DAEMON_PORT = 8073;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /mobile-sheet-scroll\.spec\.ts/,
  timeout: 30_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
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
