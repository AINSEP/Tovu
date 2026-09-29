import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Site-chat FAB presence + visual regression (`e2e/site-chat-fab-presence.spec.ts`), on the
 * theme the site actually ships.
 *
 * A sibling of `playwright.site-assistant.config.ts` rather than a spec inside it, because this
 * suite must switch the active theme to `tovu-theme` (see `e2e/site-chat-fab.globalSetup.ts`) and
 * render from the site's own theme tree, while the site-assistant specs are written against the
 * in-memory defaults (stock `content/themes`, `tovu-starter` active). Everything
 * else — fresh `apps/site-chat` build per run, `GEMINI_API_KEY` blanked, dev TLS off, no server
 * reuse — follows that config for the reasons its header gives.
 *
 * Run: `env -u TOVU_ADMIN_PASSWORD npx playwright test -c playwright.site-chat-fab.config.ts`
 * from `development/` (the login in globalSetup is the dev-auth pair, which a set admin password
 * overrides).
 */
const PORT = Number(process.env.TOVU_SITE_CHAT_FAB_E2E_PORT ?? 4995);
const DAEMON_PORT = PORT - 1;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /site-chat-fab-presence\.spec\.ts/,
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    headless: true,
  },
  expect: {
    // Same tolerance as `playwright.config.ts` (theme-visual) and the composer VRT config.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  globalSetup: path.resolve(import.meta.dirname, "e2e/site-chat-fab.globalSetup.ts"),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    /**
     * `TOVU_STOCK_THEMES_DIR` points the hermetic server at `sites/tovu-dev/themes` — the site's own
     * theme tree, what https://localhost:3000 renders — instead of the stock `content/themes` copy the
     * in-memory store otherwise reads (`deps.ts#builtInThemesDir`). The two tovu-theme trees differ:
     * the `</body>`-in-a-comment that hid the FAB was only ever in the site's copy, so a run against
     * stock themes passes on the broken state (measured 2026-09-29). Read-only here: nothing in this
     * suite edits a theme.
     */
    command:
      `apps/site-chat/node_modules/.bin/vite build apps/site-chat --config apps/site-chat/vite.config.ts && ` +
      `TOVU_STOCK_THEMES_DIR=sites/tovu-dev/themes TOVU_DISABLE_DEV_TLS=1 GEMINI_API_KEY= PORT=${PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 90_000,
    reuseExistingServer: false,
  },
});
