import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Media-provider credential suite config.
 *
 * Same hermetic two-process shape as `playwright.admin.config.ts` (API on one port, then Vite for
 * `apps/admin` with `TOVU_API_URL` pointed at it), for the same reasons documented there: the tab
 * under test lives in the admin SPA fronting Tovu's API, and a hand-started dev pair is not
 * something a rerun can depend on. `reuseExistingServer: false` on both, so a stale process can
 * never silently serve these tests.
 *
 * Two differences from that config, both load-bearing:
 *
 * 1. **`TOVU_INTEGRATIONS_ROOT_KEY` is set.** Saving a credential seals it, and with no master
 *    secret every PUT is a `503 SECRET_STORE_UNCONFIGURED` — the suite would fail on a missing env
 *    var rather than on behavior. The value is a throwaway all-`a` hex key for this hermetic
 *    in-memory DB only; nothing it seals outlives the run.
 * 2. **Ports pinned to 6471+**, clear of `3999` (`playwright.config.ts`), `4999`/`4998` (a2ui),
 *    `6421+` (`playwright.admin.config.ts`), and the conventional `3000`/`5173` dev pair, so this
 *    suite can run concurrently with any of them.
 */
const PORT_BASE = Number(process.env.MEDIA_PROVIDERS_E2E_PORT_BASE ?? 6471);
const API_PORT = PORT_BASE;
const ADMIN_PORT = PORT_BASE + 1;
const DAEMON_PORT = PORT_BASE + 2;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

/** Throwaway sealing key — 32 bytes of `a` as hex. Hermetic run only; never a real secret. */
const TEST_ROOT_KEY = "a".repeat(64);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /media-providers-.*\.spec\.ts/,
  timeout: 45_000,
  // Single worker for the same reason `playwright.admin.config.ts` pins one: every spec logs in
  // through the REAL `LOGIN_STRICT` rate limiter, which returns 429 under concurrent logins.
  // The limiter itself is untouched — this only stops the suite tripping it on itself.
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
      command: `PORT=${API_PORT} TOVU_DB=memory TOVU_INTEGRATIONS_ROOT_KEY=${TEST_ROOT_KEY} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 45_000,
      reuseExistingServer: false,
      // Catchable SIGTERM first, so `src/index.ts` can reap the agent daemon it spawns into its own
      // process group — see `playwright.admin.config.ts` for the full teardown-hang rationale.
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
