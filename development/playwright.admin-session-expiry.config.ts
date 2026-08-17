import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the session-expiry login kickback fix (2026-08-17): a session that
 * goes invalid mid-tab (expiry, revoke, server restart) must re-show `<Login>` via the client-side
 * `onUnauthenticated` listener in `lib/api.ts`, not leave the operator stuck on a dead session.
 *
 * Follows `playwright.theme-explore-narrow-sidebar.config.ts`'s precedent exactly: hermetic
 * two-process boot (the API on its own port with `TOVU_DB=memory`, then Vite for `apps/admin` on a
 * second port with `TOVU_API_URL` pointed at the first), `workers: 1` (shared `LOGIN_STRICT` rate
 * limiter trips under parallel logins), and `reuseExistingServer: false`. Vite dev mode (not the
 * built `apps/admin/dist` the main server would otherwise serve) is load-bearing here specifically —
 * this suite must exercise the fix's actual current source, not a bundle that predates it and would
 * require a separate `npm --prefix apps/admin run build` step to pick up.
 *
 * Ports 7981/7982/7983: unused by every other config in this directory as of 2026-08-17 (checked
 * against every `_PORT = ` constant across `development/playwright.*.config.ts` — nearest neighbor
 * is 7971-3 theme-explore-narrow-sidebar).
 */
const API_PORT = 7981;
const ADMIN_PORT = 7982;
const DAEMON_PORT = 7983;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-session-expiry-kickback\.spec\.ts/,
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
