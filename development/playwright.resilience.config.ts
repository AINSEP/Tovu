import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Surface-exchange resilience/lifecycle E2E config (adversarial audit, 2026-08-04).
 *
 * A dedicated config, mirroring `development/playwright.a2ui.config.ts`'s own reasoning for
 * existing rather than reusing the shared `playwright.config.ts`:
 *
 * 1. `TOVU_ENABLE_DEMO_TOOLS` must be set for `assistant_demo_a2ui`/`assistant_demo_choices` to
 *    register at all — a demo tool on the shared VRT config would be reachable from any test run
 *    using that config, not just this one.
 * 2. `webServer.cwd` must be set explicitly to the repo root — `playwright.config.ts`'s own
 *    `command` resolves `src/index.ts` relative to the CONFIG FILE's directory
 *    (`development/`) by default, which does not exist there. See `playwright.a2ui.config.ts`'s
 *    header for the confirmed repro of that trap; sidestepped here the same way.
 *
 * Ports pinned away from every other config in this repo (3999 VRT, 4999 A2UI transport-contract,
 * plus this dispatch's own default daemon 4319) so this suite can run concurrently with siblings
 * without a port collision: Tovu on 4003, its agent daemon on 4353.
 */
const PORT = 4003;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /surface-resilience-.*\.spec\.ts/,
  // Real agent CLI runs are the whole point of this suite (adversarial audit mandate: "use real
  // runs") — a single demo-tool round trip is a real model call plus a real spawned CLI process,
  // which is slow (~tens of seconds to a few minutes) and not flakiness, so the per-test timeout is
  // generous rather than tightened to the VRT suite's 30s.
  timeout: 180_000,
  // Serial, not parallel, by default: several tests deliberately drive the SAME kind of shared
  // daemon-side state (the in-process `SurfaceExchangeStore`, spawned agent-CLI subprocess counts)
  // and reasoning about "which process/exchange is this" gets much harder under worker parallelism.
  // The one test that specifically wants concurrent exchanges opens them itself, inside one test.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
    command: `PORT=${PORT} TOVU_DB=memory TOVU_ENABLE_DEMO_TOOLS=1 JINI_AGENT_DAEMON_PORT=4353 node --import tsx src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
