import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the owner-reported bug (2026-08-17): "if the preview is small, it
 * hides the sidebar" on the theme Explore screen — a narrow browser window, not a small iframe.
 *
 * A dedicated config, following `playwright.theme-liquid-preview.config.ts`/
 * `playwright.deployment-tabbar-scroll.config.ts`'s own precedent exactly: hermetic two-process boot
 * (the API on its own port with `TOVU_DB=memory`, then Vite for `apps/admin` on a second port with
 * `TOVU_API_URL` pointed at the first), `workers: 1` (shared `LOGIN_STRICT` rate limiter trips under
 * parallel logins), and `reuseExistingServer: false` so a stale process never serves this suite
 * silently. This bug only reproduces against a live Vite dev-mode render at a real narrow viewport
 * (CSS grid row auto-height collapse is not observable through jsdom), same as the tab-bar config.
 *
 * Ports 7971/7972/7973: unused by every other config in this directory as of 2026-08-17 (checked
 * against every `_PORT = ` constant across `development/playwright.*.config.ts` — nearest neighbors
 * are 7961-3 deployment-static-site-token-picker, 7921-3 visual-parity).
 */
const API_PORT = 7971;
const ADMIN_PORT = 7972;
const DAEMON_PORT = 7973;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /theme-explore-narrow-sidebar\.spec\.ts/,
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
      // Without this, a killed run's SIGKILL never reaches `src/index.ts`'s own agent-daemon reaper
      // (separate process group) and the next run's port is still held — see
      // `ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`.
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
