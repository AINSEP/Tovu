import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Config for `dockerfile-tab-editable.spec.ts` — the Deployment panel's Dockerfile tab going
 * from read-only to editable (2026-08-15). Own config family, not folded into an existing one, same
 * "independent ports, server flags and teardown per suite" reasoning `playwright.pages.config.ts`'s
 * own header gives and `playwright.post-editor.config.ts` repeats verbatim.
 *
 * Ports 7881/7882/7883: confirmed free via `lsof` on 2026-08-15 — the next open slot in the 78xx
 * block after `playwright.deployment-tabbar-scroll.config.ts`'s own 7871-3 and before
 * `playwright.visual-parity.config.ts`'s 7921-3.
 *
 * `webServer.cwd: REPO_ROOT` matters more here than in most sibling configs: the API server's own
 * `process.cwd()` is exactly where `features/deployments/dockerfile.ts`'s `dockerfilePath()`
 * resolves the repo-root `Dockerfile` it reads and writes — so this config, like every other one in
 * this directory that boots the real API, is pointed at the REAL project root and therefore at the
 * REAL Dockerfile on disk, not a scratch copy. The spec itself is responsible for leaving that file
 * exactly as it found it (see its own header) — nothing about the harness isolates this one file the
 * way `TOVU_DB=memory` isolates the database.
 */
const API_PORT = 7881;
const ADMIN_PORT = 7882;
const DAEMON_PORT = 7883;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /dockerfile-tab-editable\.spec\.ts/,
  timeout: 30_000,
  // One worker: parallel logins trip the real `LOGIN_STRICT` rate limiter (discovered live by
  // `playwright.admin.config.ts`) — every sibling config in this directory that logs in follows the
  // same rule. Also keeps this suite's own real-file read/edit/restore cycle from ever running two
  // instances against the same on-disk Dockerfile at once.
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
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      // `node --import tsx src/index.ts` boots two processes; a SIGKILL on the wrapper orphans the
      // child still bound to the port, and the next run dies EADDRINUSE looking like flake.
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
