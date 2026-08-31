import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Admin-locale-after-login E2E config (2026-08-09, "AI Assistant language change did
 * nothing" regression).
 *
 * Modeled on `playwright.destructive.config.ts`, which documents the two traps this inherits:
 * an explicit `webServer.cwd` at the repo root (Playwright resolves `command` against the CONFIG
 * file's directory otherwise, and `development/src/index.ts` does not exist), and a fresh
 * `TOVU_CONTENT_DB` temp file rather than `TOVU_DB=memory` — the app boots a main process AND an
 * agent-daemon subprocess, and process-local in-memory SQLite gives them different admin principal
 * ids. Never `infra/content.db`: a prior session broke the owner's real admin login by holding
 * that file open across a hung server.
 *
 * This suite serves the BUILT admin SPA from the Tovu server, so `npm --prefix apps/admin run
 * build` must run before it or the source fix under test never reaches the browser.
 *
 * Ports 4980/4981 — free of every pair already reserved by a sibling config as of 2026-08-09
 * (4990/4991 destructive, 4994-4999 a2ui/resilience, 4992/4993 + 7821-7843 + 7921-7923 BYOK and
 * admin-fab, 5972/5973 login-api-down, 4003, 3999 VRT, 4319 real daemon default, 5173 Vite).
 *
 * `workers: 1`: every test logs in through the real `LOGIN_STRICT` rate limiter, and both tests
 * here log in more than once (a second browser context is the whole point of §1). Same reasoning
 * `playwright.admin.config.ts` documents for pinning to one worker.
 */
const PORT = 4980;
const DAEMON_PORT = 4981;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DB_PATH = path.join(os.tmpdir(), `tovu-e2e-admin-locale-${Date.now()}-${process.pid}.db`);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-locale-after-login\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `PORT=${PORT} TOVU_CONTENT_DB=${CONTENT_DB_PATH} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
