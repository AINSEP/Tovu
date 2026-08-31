import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Reset-password confirm+reveal round-trip E2E config.
 *
 * Modeled on `playwright.admin.config.ts` (BYOK) — the established two-process pattern for
 * exercising a REAL admin-UI flow against a REAL, hermetic Tovu API with no pre-build step: boots
 * the API with `TOVU_DB=memory` on its own port, then Vite for `apps/admin` on a second port with
 * `TOVU_API_URL` pointed at the first (`apps/admin/vite.config.ts` already reads that env var for
 * its `/api` proxy — no source edit needed). This is what lets the suite run against whatever is
 * currently on disk in `apps/admin/src`, including source just edited in this same session, with
 * no `npm --prefix apps/admin run build` step to remember or let go stale.
 *
 * `TOVU_DB=memory`, not a `TOVU_CONTENT_DB` temp file: `playwright.destructive.config.ts`'s own
 * header documents why THAT suite needs a shared-file DB (the agent daemon spawns as a SEPARATE
 * process and re-seeds its own random admin-principal UUID against a process-local in-memory DB,
 * breaking `content.read`/`content.write`-gated tool calls). This suite never calls an agent-tool
 * route — login, user creation, and password reset are identity/administration routes
 * (`src/server/inbound/admin-http/routes/users/*`, `src/server/inbound/admin-http/dev-auth.ts`), not content-gated
 * ones — so the simpler `TOVU_DB=memory` (the same choice `playwright.admin.config.ts` makes) is
 * sufficient.
 *
 * `workers: 1`, not `fullyParallel`: every spec here logs in through the REAL `LOGIN_STRICT` rate
 * limiter, same reasoning `playwright.admin.config.ts`/`playwright.destructive.config.ts` document
 * for pinning to one worker — and this suite logs in three separate times in one run (the owner,
 * the new non-admin user with its new password, then a deliberately REJECTED attempt with the old
 * one), which would trip the limiter even sooner under parallel workers.
 *
 * Ports (API/ADMIN/DAEMON): 7931/7932/7933 — chosen free of every port already reserved by a
 * sibling config as of this dispatch (3999, 4319, 4353, 4980-4999, 5972-5973, 6421, 6471, 6481,
 * 7821-7863, 7921-7923).
 */
const PORT_BASE = Number(process.env.RESET_PASSWORD_E2E_PORT_BASE ?? 7931);
const API_PORT = PORT_BASE;
const ADMIN_PORT = PORT_BASE + 1;
const DAEMON_PORT = PORT_BASE + 2;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /users-reset-password\.spec\.ts/,
  timeout: 45_000,
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // In-memory DB: hermetic, no risk to any real workspace data, fresh state every run.
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      // Without this, Playwright's default teardown sends an uncatchable `SIGKILL` straight to the
      // webServer's own process group, which never reaches `src/index.ts`'s reap-the-agent-daemon
      // logic (the daemon lives in a deliberately separate process group) — the orphaned daemon
      // then keeps this webServer's stdout/stderr pipe open forever and teardown hangs. Same fix
      // `playwright.admin.config.ts` documents and applies for the identical reason.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      // `TOVU_API_URL` re-points vite.config.ts's `/api` proxy at the hermetic API above instead
      // of its `localhost:3000` default.
      command: `TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
