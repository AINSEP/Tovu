import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the owner-reported bug (2026-09-14): "Theme editor goes blank and
 * read-only briefly on every file load" on the theme Explore screen's HTML tab. See
 * `e2e/theme-explore-file-switch.spec.ts` for the root cause and fix.
 *
 * Same hermetic two-process boot as `playwright.theme-explore-narrow-sidebar.config.ts`: the API on
 * its own port with `TOVU_DB=memory`, then Vite for `apps/admin` on a second port with `TOVU_API_URL`
 * pointed at the first, `workers: 1` (the shared `LOGIN_STRICT` rate limiter trips under parallel
 * logins), and `reuseExistingServer: false` so a stale process never serves this suite silently.
 *
 * `TOVU_DISABLE_DEV_TLS=1` on both processes: on a machine with the repo root's `.certs/`, both the
 * API (`dev-tls.ts`) and Vite (`vite.config.ts`) otherwise switch to HTTPS and the plain-http
 * readiness URLs below never answer — the escape hatch `vite.config.ts` documents for exactly this.
 *
 * Ports 8091/8092/8093: unused by every other config in this directory as of 2026-09-14 (highest
 * neighbor is 8081-3).
 */
const API_PORT = 8091;
const ADMIN_PORT = 8092;
const DAEMON_PORT = 8093;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /theme-explore-file-switch\.spec\.ts/,
  timeout: 60_000,
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
      command: `TOVU_DISABLE_DEV_TLS=1 PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 90_000,
      reuseExistingServer: false,
      // Without this, a killed run's SIGKILL never reaches `src/index.ts`'s own agent-daemon reaper
      // (separate process group) and the next run's port is still held — see
      // `ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `TOVU_DISABLE_DEV_TLS=1 TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 90_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
