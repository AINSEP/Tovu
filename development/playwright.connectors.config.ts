import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Composio connectors suite config.
 *
 * Same hermetic two-process shape as `playwright.media-providers.config.ts` (API on one port, then
 * Vite for `apps/admin` with `TOVU_API_URL` pointed at it), for the same reasons documented there.
 * `reuseExistingServer: false` on both, so a stale process can never silently serve these tests.
 *
 * `TOVU_INTEGRATIONS_ROOT_KEY` is set for the same reason that config sets it: saving a Composio
 * API key seals it, and with no master secret every PUT is a `503 SECRET_STORE_UNCONFIGURED` — the
 * suite would fail on a missing env var rather than on behavior. Throwaway all-`a` hex key for this
 * hermetic in-memory DB only.
 *
 * Ports pinned to 6481+, clear of `3999` (`playwright.config.ts`), `4999`/`4998` (a2ui), `6421+`
 * (`playwright.admin.config.ts`), `6471+` (`playwright.media-providers.config.ts`), and the
 * conventional `3000`/`5173` dev pair, so this suite can run concurrently with any of them.
 *
 * NOTE ON SCOPE: nothing here talks to Composio's real API, and it deliberately cannot — no project
 * key exists in this environment (Jini's `composio/source-map.md` records that as an accepted
 * verification gap). Every assertion below exercises Tovu's own routes, storage, and UI against the
 * provider's in-process STATIC catalog, which is exactly the surface this slice added.
 */
const PORT_BASE = Number(process.env.CONNECTORS_E2E_PORT_BASE ?? 6481);
const API_PORT = PORT_BASE;
const ADMIN_PORT = PORT_BASE + 1;
const DAEMON_PORT = PORT_BASE + 2;
const FAKE_COMPOSIO_PORT = PORT_BASE + 3;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const FAKE_COMPOSIO_URL = `http://127.0.0.1:${FAKE_COMPOSIO_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

/** Must match `composioUserIdFor("workspace-local")` in `src/platform/connectors/composio-service.ts`. */
const FAKE_COMPOSIO_USER_ID = "tovu-workspace-workspace-local";

/** Throwaway sealing key — 32 bytes of `a` as hex. Hermetic run only; never a real secret. */
const TEST_ROOT_KEY = "a".repeat(64);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /connectors-.*\.spec\.ts/,
  timeout: 45_000,
  // Single worker: every spec logs in through the REAL `LOGIN_STRICT` rate limiter, which returns
  // 429 under concurrent logins.
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
    // Stands in for Composio's API. Must start FIRST: the API server below is handed its origin as
    // an env var at boot and never re-reads it.
    {
      command: `FAKE_COMPOSIO_PORT=${FAKE_COMPOSIO_PORT} FAKE_COMPOSIO_USER_ID=${FAKE_COMPOSIO_USER_ID} node --import tsx development/e2e/fake-composio-cli.ts`,
      cwd: REPO_ROOT,
      url: `${FAKE_COMPOSIO_URL}/api/v3.1/auth_configs`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: `PORT=${API_PORT} TOVU_DB=memory TOVU_INTEGRATIONS_ROOT_KEY=${TEST_ROOT_KEY} TOVU_COMPOSIO_BASE_URL=${FAKE_COMPOSIO_URL} TOVU_PUBLIC_URL=${BASE_URL} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 45_000,
      reuseExistingServer: false,
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
