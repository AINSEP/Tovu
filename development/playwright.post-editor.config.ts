import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Config for every `post-editor-*.spec.ts` suite (coordinator MSG #1/#2/#3, 2026-08-11/12
 * expansion) — toolbar clicks, preview-branch coverage, and the bubble-menu/drag-handle specs all
 * drive the SAME screen (`PostEditor.tsx`) against the SAME hermetic boot, so they share one config
 * via `testMatch`'s glob rather than three configs duplicating the same ports/webServer block. This
 * mirrors `playwright.admin.config.ts`'s own `byok-*.spec.ts` grouping precedent, not a new pattern.
 *
 * Own config family, not folded into an existing one — this directory's established shape
 * (`playwright.pages.config.ts`'s own header explains why: independent ports, server flags and
 * teardown per suite). Copies that config's two confirmed traps verbatim:
 *
 * 1. `webServer.cwd` must be explicit (`REPO_ROOT`) — Playwright resolves `command` against the
 *    CONFIG file's directory otherwise, and `node --import tsx apps/website/src/index.ts` silently becomes
 *    `development/src/index.ts`.
 * 2. Ports must not collide with any other suite in this directory. The 78xx block already has
 *    7821-3 (admin-fab), 7831-3 (pages), 7841-3 (placeholder-tabs), 7921-3 (visual-parity) —
 *    7851-3 is the next free slot in that sequence.
 *
 * `VITE_TOVU_SITE_URL` is set to this config's own `API_BASE_URL` — `apps/admin/src/lib/site-url.ts`
 * otherwise falls back to `http://localhost:3000` in dev, which is some OTHER process (or nothing) on
 * this port scheme, not this suite's own hermetic server. Not required for the suite's own assertions
 * (which fetch the public URL directly via `page.request`, not through the admin's own "view ↗"
 * link), but keeps the app's in-page behavior consistent with what this config actually boots.
 */
const API_PORT = 7851;
const ADMIN_PORT = 7852;
const DAEMON_PORT = 7853;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /post-editor-.*\.spec\.ts/,
  timeout: 45_000,
  // One worker: parallel logins trip the real `LOGIN_STRICT` rate limiter, as
  // `playwright.admin.config.ts` discovered live — every sibling config in this directory that logs
  // in follows the same rule.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 45_000,
      reuseExistingServer: false,
      // `node --import tsx apps/website/src/index.ts` boots two processes; a SIGKILL on the wrapper orphans the
      // child still bound to the port, and the next run dies EADDRINUSE looking like flake. See
      // `ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `TOVU_API_URL=${API_BASE_URL} VITE_TOVU_SITE_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 45_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
