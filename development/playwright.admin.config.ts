import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file BYOK execution-mode adversarial audit config (2026-08-04 dispatch — MSG-1 through MSG-4).
 *
 * A dedicated config, following `playwright.a2ui.config.ts`'s precedent, for three reasons:
 *
 * 1. **Hermetic, two-process boot.** The BYOK surface lives in the admin SPA (served by Vite in
 *    dev, never by Tovu's own server), fronting Tovu's API. `playwright.config.ts` only boots the
 *    API — there is no existing config that boots both. This one boots the API with
 *    `TOVU_DB=memory` on its own port, THEN Vite for `apps/admin` on a second port with
 *    `TOVU_API_URL` pointed at the first — `apps/admin/vite.config.ts:57` already reads that env
 *    var for its `/api` and `/agent-icons` proxies, so no source edit was needed to wire this up.
 * 2. **Never depends on a hand-started dev server.** This suite's origin dispatch discovered live
 *    that the shared `:5173`/`:3000` dev pair can go stale mid-session (the API process died,
 *    Vite's proxy target didn't move with it, `:5173` started 500ing on login) with no warning —
 *    and that a hand-started server is, by definition, not something a rerun of this suite can
 *    depend on existing. `reuseExistingServer: false` on both entries is deliberate, same
 *    rationale as `playwright.config.ts`'s own VRT suite: a stale process must never serve these
 *    tests silently.
 * 3. **Ports chosen to never collide with anything already seen running in this repo's dev
 *    workflow**: not `3000` (Tovu's conventional API default), not `5173` (Vite's default, and the
 *    admin `dev` script's explicit port), not `3999` (`playwright.config.ts`) or `4999`
 *    (`playwright.a2ui.config.ts`), and not `4530` (an unrelated stray process observed live during
 *    the origin dispatch). `JINI_AGENT_DAEMON_PORT` is likewise pinned away from the real daemon's
 *    default (4319, `src/assistant/agent-daemon-server.ts:102`) and from the a2ui config's own pin
 *    (4998), for the same "never collide with a concurrently running instance" reason documented
 *    there.
 */
// Overridable as a block so two audit runs can execute concurrently without colliding on ports —
// `reuseExistingServer: false` (below) means a collision is a hard failure, not a silent reuse.
// Defaults are the originals, so an unset environment behaves exactly as before.
const PORT_BASE = Number(process.env.BYOK_E2E_PORT_BASE ?? 6421);
const API_PORT = PORT_BASE;
const ADMIN_PORT = PORT_BASE + 1;
const DAEMON_PORT = PORT_BASE + 2;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /byok-.*\.spec\.ts/,
  timeout: 30_000,
  // NOT `fullyParallel`, and pinned to a single worker: every spec in this suite logs in
  // through the REAL `LOGIN_STRICT` rate limiter (`src/server/inbound/admin-http/dev-auth.ts`) —
  // measured live, concurrent logins across parallel workers return 429 instead of 200, which
  // has nothing to do with the behavior under test. This is not "shortening a duration to make
  // a test convenient" (that would mean weakening an assertion) — the rate limiter itself is
  // untouched and still fully in effect; this just stops the suite from tripping it on itself.
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
      // Confirmed 2026-08-05 (`ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`):
      // without this, Playwright's default teardown skips straight to
      // `process.kill(-webServerPid, "SIGKILL")` on the webServer's OWN process group —
      // uncatchable, so `src/index.ts`'s `spawnAgentDaemon()` never gets the signal it needs to
      // reap the agent daemon (which lives in a deliberately SEPARATE process group, per that
      // function's own comment, and so is never touched by the group-SIGKILL above). The orphaned
      // daemon then keeps this webServer's inherited stdout/stderr pipe open forever, and
      // Playwright's teardown — which waits for that pipe to close — hangs indefinitely with no
      // result printed. Opting in here makes Playwright send a real, catchable SIGTERM first, which
      // reaches `src/index.ts` normally and lets its existing reap-the-daemon-group logic run.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      // `TOVU_API_URL` re-points vite.config.ts's `/api` and `/agent-icons` proxies at the
      // hermetic API above instead of its `localhost:3000` default.
      command: `TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 30_000,
      reuseExistingServer: false,
      // Same rationale as the API entry above, applied for consistency: a plain SIGTERM lets
      // Vite (and anything it spawns) exit cleanly instead of relying on the SIGKILL fallback.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
