import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file A2UI/MCP-UI transport E2E config (SPEC-046 / ADR-055 verification pass, 2026-08-04).
 *
 * A dedicated config rather than reusing `playwright.config.ts` for two reasons:
 *
 * 1. HISTORICAL, no longer load-bearing: `TOVU_ENABLE_DEMO_TOOLS` had to be set for
 *    `assistant_demo_a2ui`/`assistant_demo_choices` to register at all, and the shared VRT config
 *    must not carry a var that widens the tool surface of every suite booting against it. That gate
 *    was removed on 2026-08-26 (see `src/assistant/demo-choices-tool.ts`) — both tools now register
 *    unconditionally, so this reason no longer distinguishes this config from the shared one, and
 *    the var is gone from `webServer.command` below. Reason 2 alone still requires a separate file.
 * 2. `playwright.config.ts`'s own `webServer.command` (`PORT=${PORT} ... node --import tsx
 *    src/index.ts`) is a path relative to the REPO ROOT, but Playwright spawns `webServer.command`
 *    with `cwd` defaulting to this config file's own directory (`development/`) when `webServer.cwd`
 *    is not set explicitly. That mismatch means `node --import tsx src/index.ts` resolves to
 *    `development/src/index.ts` (doesn't exist) and the web server never boots — confirmed live,
 *    2026-08-04: both `npm run test:visual` (no args) and a direct `npx playwright test
 *    --config=development/playwright.config.ts` fail identically with `ERR_MODULE_NOT_FOUND` on
 *    `development/src/index.ts`, and running the raw shell command with `cwd=development/`
 *    reproduces the exact same error independent of Playwright entirely. This is a PRE-EXISTING bug
 *    in the shared config, unrelated to A2UI, and is currently blocking `npm run test:visual`
 *    end to end — see the verification report this config shipped with
 *    (`ADS-memory/.local-artifacts/reports/20260804-a2ui-e2e-verification.md`) for the full
 *    repro. Not fixed here: `playwright.config.ts` is shared by a suite outside this dispatch's
 *    scope, and the safe fix (an explicit `webServer.cwd`) belongs with whoever owns that file.
 *    This config sidesteps the same trap by setting `cwd` explicitly below.
 */
const PORT = 4999;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /a2ui-.*\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // `JINI_AGENT_DAEMON_PORT` pinned away from the default 4319 — this suite must never collide
    // with another Tovu dev instance's own daemon subprocess running concurrently on the same box.
    command: `PORT=${PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=4998 node --import tsx src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
