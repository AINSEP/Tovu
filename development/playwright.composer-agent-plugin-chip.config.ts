import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Hermetic config for `admin-composer-agent-plugin-chip.spec.ts` — the client-half proof
 * that pinning "UI/UX Design (Agent Plugin)" from the composer's "+" menu (1) renders a removable
 * chip without typing anything into the draft, (2) the chip's × actually removes it, and (3) the
 * real outbound `POST /api/runs` body carries `contextRef.pluginRefIds: ["ui-ux-design"]`.
 *
 * Sibling to `playwright.composer-typeahead-visual.config.ts` (same hermetic two-process boot,
 * same `workers: 1` for the shared `LOGIN_STRICT` rate limiter, same live-Vite-dev-mode dependency
 * on `@jini-ai/chat`'s built `dist/` for `.jini-composer-*`/`.jini-attachment-*` styles) — own
 * config, own ports, per this directory's "fresh, small, dedicated config per topic-specific
 * spec" convention.
 *
 * Ports 8051/8052/8053: confirmed free via `lsof` on 2026-08-21, next unclaimed slot in this
 * directory's `+10`-per-config port ladder (last claimed triple: 8041/8042/8043,
 * `playwright.composer-typeahead-visual.config.ts`).
 *
 * `timeout: 60_000` for the same reason `playwright.composer-typeahead-visual.config.ts` documents:
 * the FIRST test in a file pays Vite dev-mode's cold JIT-transform cost for the login page's full
 * module graph.
 *
 * ---------------------------------------------------------------------------
 * Headed / "watch it run" mode (2026-08-21, owner request)
 * ---------------------------------------------------------------------------
 * `headless: true` below is the default this config runs with — every assertion is unchanged
 * either way, so this stays the one gate-usable invocation. Playwright's own `--headed` CLI flag
 * overrides `use.headless` at runtime with no config change needed, so the SAME committed spec is
 * already headed-capable:
 *
 *   npm run test:e2e:agent-plugin-chip:watch
 *
 * (`package.json`'s `test:e2e:agent-plugin-chip:watch` script — `playwright test --config=...
 * --headed`, with `TOVU_E2E_SLOWMO=250` set so the run is actually watchable rather than a blur).
 * `TOVU_E2E_SLOWMO` (below, `use.launchOptions.slowMo`) defaults to `0` — unset, this config's
 * headless default runs at full speed, exactly as it did before this section existed.
 */
const API_PORT = 8051;
const ADMIN_PORT = 8052;
const DAEMON_PORT = 8053;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-composer-agent-plugin-chip\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
    headless: true,
    // Zero by default (every headless/gate run) — the `:watch` npm script is the only caller that
    // sets `TOVU_E2E_SLOWMO`, so a plain `--headed` invocation with no env var still runs at full
    // speed. See this file's own "Headed / watch it run mode" doc above.
    launchOptions: { slowMo: process.env.TOVU_E2E_SLOWMO ? Number(process.env.TOVU_E2E_SLOWMO) : 0 },
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
