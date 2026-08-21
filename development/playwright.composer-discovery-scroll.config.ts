import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Admin composer discovery popover phantom-scroll regression config (2026-08-21).
 *
 * Sibling to `playwright.composer-discovery.config.ts`, split into its own file/port triple rather
 * than folded into that one — same "fresh, small, dedicated config per topic-specific spec"
 * rationale that config's own header states, and its `testMatch` is deliberately locked to a single
 * spec file, so widening it to a second unrelated bug would mean loosening that lock rather than
 * following the established pattern.
 *
 * This spec needs the same live-Vite-dev-mode boot as its sibling, and the same caveat applies: the
 * fix under test lives in `@jini-ai/chat`'s runtime-injected default theme
 * (`packages/chat/src/react/features/chat-pane/styles.ts`), consumed here through `dist/`, not
 * `src/` — a source fix in Jini does nothing until `packages/chat`'s own `npm run build` has run.
 *
 * Ports 8031/8032/8033: confirmed free via `lsof` on 2026-08-21, next unclaimed slot in this
 * directory's own `+10`-per-config port ladder (last claimed triple before this one:
 * 8021/8022/8023, `playwright.composer-discovery.config.ts`).
 */
const API_PORT = 8031;
const ADMIN_PORT = 8032;
const DAEMON_PORT = 8033;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-composer-discovery-menu-scroll\.spec\.ts/,
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
