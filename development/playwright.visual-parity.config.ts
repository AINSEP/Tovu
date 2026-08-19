import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Admin visual-parity audit config (web-design pass, 2026-08-05 — Workspace/Taxonomy vs
 * Settings/Posts).
 *
 * Same two-process hermetic boot shape as `playwright.admin-fab.config.ts` /
 * `playwright.admin.config.ts`: the API on its own port with `TOVU_DB=memory`, then Vite for
 * `apps/admin` on a second port with `TOVU_API_URL` pointed at the first. A dedicated config
 * because this suite's job is screenshot capture across many admin sections (Settings, Posts,
 * Workspace, Taxonomy, Media, Menus), not a narrow behavior assertion — it doesn't belong bundled
 * into any topic-specific config already here.
 *
 * Ports 7921/7922/7923: confirmed free via `lsof` on 2026-08-05 against every other config's own
 * documented reservation (BYOK 6421, a2ui 4998/4999, destructive 4990/4991, live-agent 4997,
 * resilience 4353, admin-fab 7821/7822/7823, real daemon default 4319, Vite/API conventional
 * defaults 5173/3000).
 *
 * Deliberately `TOVU_DB=memory`, never the real `infra/content.db` — this suite creates its own
 * demo taxonomy/terms through the real admin API against the ephemeral store so Categories & Tags
 * renders with actual rows (the owner's complaint is about a populated screen, not the empty
 * state), and never touches the owner's real content.
 */
const API_PORT = 7921;
const ADMIN_PORT = 7922;
const DAEMON_PORT = 7923;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-visual-parity\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
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
