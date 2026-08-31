import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the owner-reported bug (2026-08-12): clicking a `.liquid` template
 * (`entry.liquid`, `home.liquid`, `product.liquid`, …) in the admin Explore file browser downloaded
 * the file to the browser instead of previewing it.
 *
 * A dedicated config, following `playwright.pages.config.ts`/`playwright.admin-fab.config.ts`'s own
 * precedent exactly: hermetic two-process boot (the API on its own port with `TOVU_DB=memory`, then
 * Vite for `apps/admin` on a second port with `TOVU_API_URL` pointed at the first), `workers: 1` (a
 * shared `LOGIN_STRICT` rate limiter trips under parallel logins — same reasoning those configs
 * document), and `reuseExistingServer: false` so a stale process never serves this suite silently.
 *
 * Ports 7861/7862/7863: unused by every other config in this directory as of 2026-08-12 (confirmed
 * via `lsof` — the nearest neighbors are 7821-3 admin-fab, 7831-3 pages, 7841-2 placeholder-tabs,
 * 7851-3 post-editor, 7921-2 visual-parity).
 */
const API_PORT = 7861;
const ADMIN_PORT = 7862;
const DAEMON_PORT = 7863;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /theme-liquid-preview\.spec\.ts/,
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
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      // Without this, a killed run's SIGKILL never reaches `src/index.ts`'s own agent-daemon reaper
      // (separate process group) and the next run's port is still held — see
      // `ADS-memory/reports/analysis/2026-08-05-e2e-teardown-root-cause.md`.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      // `VITE_TOVU_SITE_URL` (2026-08-12, `.liquid` render preview): without this, `siteUrl()`
      // (`apps/admin/src/lib/site-url.ts`) defaults to `http://localhost:3000` in dev mode — the
      // OWNER'S real dev server, not this suite's own hermetic API — so the preview iframe's `src`
      // would resolve outside this suite's isolated boot entirely. Harmless for the pre-existing
      // source-preview test (never needs the iframe to load), but load-bearing for the render-preview
      // tests added alongside this fix.
      command: `TOVU_API_URL=${API_BASE_URL} VITE_TOVU_SITE_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
