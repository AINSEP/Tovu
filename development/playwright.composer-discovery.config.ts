import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Admin composer discovery/slash-menu popover config (5-bug fix, 2026-08-21).
 *
 * Same rationale and boot shape as `playwright.admin-fab.config.ts` (itself following
 * `playwright.admin.config.ts`'s precedent): a fresh, small, dedicated config per topic-specific
 * spec in this directory, reusing live-Vite dev-mode rendering rather than a build artifact, so it
 * matches how the popover was actually diagnosed (a live `/admin/` session, not a bundled build).
 *
 * The one thing THIS config's spec needs that most others don't: `.jini-composer-discovery-menu`
 * and `.jini-composer-slash-menu` are styled by `@jini-ai/chat`'s runtime-injected default theme
 * (`packages/chat/src/react/features/chat-pane/styles.ts`), which this repo consumes as a `file:`
 * dependency resolved through `dist/`, not `src/` — a source fix in Jini does nothing here until
 * `packages/chat`'s own `npm run build` has run. That's an operator/CI precondition, not something
 * this config can express, but it's the reason a fresh `pnpm install`/clean checkout won't
 * reproduce the fix without it.
 *
 * Ports 8021/8022/8023: confirmed free via `lsof` on 2026-08-21, next unclaimed slot in this
 * directory's own `+10`-per-config port ladder (last claimed pair before this one: 8011/8012/8013).
 */
const API_PORT = 8021;
const ADMIN_PORT = 8022;
const DAEMON_PORT = 8023;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-composer-discovery-menu-overlap\.spec\.ts/,
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
