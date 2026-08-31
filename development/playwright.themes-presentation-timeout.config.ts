import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the "Loading themes…" forever-hang fix (2026-08-17): the browser's
 * per-origin HTTP/1.1 connection cap (Chrome: 6 concurrent connections per origin) can be exhausted
 * by long-lived `EventSource` streams (the settings change feed `App.hooks.tsx` opens once per open
 * admin tab, deliberately never closed — see `apps/admin/src/lib/settings-events.ts`'s own header).
 * Once exhausted, any OTHER request to that origin — including the Themes screen's `getPresentation()`
 * call — has no free socket and queues in the browser forever: no server-side error (the request never
 * even reaches the server), no client-side rejection (nothing aborts it), just a permanent hang. The
 * fix bounds every `lib/api.ts` request with a client-side timeout so this now fails visibly instead.
 *
 * Follows `playwright.admin-session-expiry.config.ts`'s precedent: hermetic two-process boot
 * (`TOVU_DB=memory` API + Vite admin, each on its own port), `workers: 1`, `reuseExistingServer:
 * false`. `timeout: 100_000` (well past that config's 30s) because this suite deliberately waits out
 * `lib/api.ts`'s real 60s request-timeout window rather than mocking it — see the spec's own header
 * for why a real wait is the point, not a shortcut to avoid.
 *
 * Ports 7991/7992/7993: unused by every other config in this directory as of 2026-08-17 (checked
 * against every `_PORT = ` constant across `development/playwright.*.config.ts` — nearest neighbor is
 * 7981-3 admin-session-expiry).
 */
const API_PORT = 7991;
const ADMIN_PORT = 7992;
const DAEMON_PORT = 7993;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /themes-presentation-request-timeout\.spec\.ts/,
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
