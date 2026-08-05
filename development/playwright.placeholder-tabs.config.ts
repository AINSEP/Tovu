import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

import { STORAGE_STATE_PATH } from "./e2e/placeholder-tabs.globalSetup";

/**
 * @file Placeholder-tabs card-parity config (web-design pass, 2026-08-05 — Payments/Deployment/
 * Authentication vs Settings).
 *
 * Same two-process hermetic boot shape as `playwright.admin.config.ts` / `playwright.visual-
 * parity.config.ts`: the API on its own port with `TOVU_DB=memory`, then Vite for `apps/admin` on
 * a second port with `TOVU_API_URL` pointed at the first. A dedicated config rather than folding
 * into `playwright.visual-parity.config.ts` because that suite is mid-flight on a different section
 * pair (Workspace/Taxonomy) in this same session — a second config avoids two agents fighting over
 * one webServer's port lease.
 *
 * Ports 7841/7842/7843: chosen distinct from every other config's own documented reservation as of
 * this pass (BYOK 6421, a2ui 4998/4999, destructive 4990/4991, live-agent 4997, resilience 4353,
 * admin-fab 7821/7822/7823, pages 7831/7832/7833, visual-parity 7921/7922/7923, real daemon default
 * 4319, Vite/API conventional defaults 5173/3000) and confirmed free via `lsof` before first use.
 *
 * `TOVU_DB=memory`, never the real `infra/content.db` — this suite only navigates to placeholder
 * "coming soon" screens and never writes, but memory mode is still the safe default for anything
 * that boots the real server.
 */
const API_PORT = 7841;
const ADMIN_PORT = 7842;
const DAEMON_PORT = 7843;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /placeholder-tabs-card-parity\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // One login, reused by every test via `storageState` — see that file's own header for why the
  // login must happen in `globalSetup` rather than a spec-level `beforeAll`.
  globalSetup: require.resolve("./e2e/placeholder-tabs.globalSetup"),
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
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
