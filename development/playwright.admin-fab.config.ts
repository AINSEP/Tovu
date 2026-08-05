import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Admin chat-FAB position config (Bug 5 browser verification, 2026-08-05).
 *
 * A dedicated config, following `playwright.admin.config.ts`'s precedent exactly (same two-process
 * boot shape: the API on its own port with `TOVU_DB=memory`, then Vite for `apps/admin` on a second
 * port with `TOVU_API_URL` pointed at the first) — the chat FAB and dock live in the admin SPA, so
 * this needs the same hermetic, never-depends-on-a-hand-started-dev-server boot that config already
 * proved out, not a new pattern.
 *
 * `destructive-path.spec.ts` (`playwright.destructive.config.ts`) already renders the same
 * `button.chat-fab`/`.admin-chat-dock` elements, but from the ADMIN'S OWN BUILT BUNDLE (a
 * production-style single-origin boot, requiring `npm --prefix apps/admin run build` first) rather
 * than a live Vite dev server, and its `testMatch` is scoped to `(login|destructive-path)`, not
 * meant to absorb an unrelated spec. A fresh, small, dedicated config — matching every other
 * topic-specific config already in this directory (`a2ui`, `destructive`, `resilience`,
 * `live-agent`, `site-assistant`) — is the safer addition: purely additive, touches no other
 * agent's file, and reuses live-Vite dev-mode rendering (matching how an operator actually sees
 * this bug, and how it was originally caught) rather than a build artifact.
 *
 * Ports 7821/7822/7823: confirmed free via `lsof` on 2026-08-05 against every other config's own
 * documented reservation (BYOK 6421, a2ui 4998/4999, destructive 4990/4991, live-agent 4997,
 * resilience 4353, real daemon default 4319, Vite/API conventional defaults 5173/3000).
 */
const API_PORT = 7821;
const ADMIN_PORT = 7822;
const DAEMON_PORT = 7823;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-fab-.*\.spec\.ts/,
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
      // Same rationale as `playwright.admin.config.ts`'s own entry — see
      // `ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md` for the full mechanism.
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
