import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file SPEC-047 — config for `pages-editor.spec.ts`.
 *
 * Its own config, not a `testMatch` added to an existing one, because that is this directory's
 * established shape: every suite owns a config so one suite's ports, server flags and teardown
 * cannot leak into another's. Two traps this file sidesteps, both already documented by siblings and
 * both re-confirmed live while writing it:
 *
 * 1. **`webServer.cwd` must be explicit.** Playwright resolves `webServer.command` against the
 *    CONFIG FILE's directory (`development/`), not the repo root — so `node --import tsx
 *    src/index.ts` silently becomes `development/src/index.ts` and the boot dies with
 *    `ERR_MODULE_NOT_FOUND`. `playwright.config.ts` still carries that latent bug; this one sets
 *    `cwd: REPO_ROOT`, the same fix `admin-fab`/`admin`/`destructive` use.
 * 2. **Ports must not collide with anything else.** A running local `npm run dev` holds 3000/4319
 *    and the admin Vite holds 5173, so a suite reusing those either fights the developer's own
 *    session or silently tests it instead of a fresh boot. The 78xx block below is unused by every
 *    other config here (7821-3 admin-fab, 4353 resilience, 4993 adversarial, 4997 live-agent).
 *
 * Serves the admin through a real Vite dev server rather than a built bundle, so the suite exercises
 * the same code path a developer sees, and `reuseExistingServer: false` keeps it a fresh boot every
 * run rather than whatever state a previous one left behind.
 */
const API_PORT = 7831;
const ADMIN_PORT = 7832;
const DAEMON_PORT = 7833;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /pages-editor\.spec\.ts/,
  timeout: 45_000,
  // One worker: parallel logins trip the real `LOGIN_STRICT` rate limiter, as
  // `playwright.admin.config.ts` discovered live.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Wide enough that the editor renders at its real desktop proportions rather than a collapsed
    // narrow layout — this suite asserts on a preview whose whole job is width fidelity.
    viewport: { width: 1440, height: 900 },
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 45_000,
      reuseExistingServer: false,
      // `node --import tsx src/index.ts` boots two processes; a SIGKILL on the wrapper orphans the
      // child still bound to the port, and the next run dies EADDRINUSE looking like flake. See
      // `ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 45_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
