import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

import { STORAGE_STATE_PATH } from "./e2e/adversarial.globalSetup.js";

/**
 * @file Adversarial surface-abuse + resilience E2E config (2026-08-04 dispatch: "Surface abuse +
 * resilience e2e").
 *
 * Modeled directly on `playwright.a2ui.config.ts` — the proven precedent for this app's E2E
 * bring-up trap (see that file's own header for the full repro): `webServer.command` is a repo-root
 * relative path, but Playwright spawns it with `cwd` defaulting to THIS config file's own directory
 * (`development/`) unless `webServer.cwd` is set explicitly, which silently resolves
 * `node --import tsx src/index.ts` to a nonexistent `development/src/index.ts` and the server never
 * boots. Sidestepped here the same way: `cwd: REPO_ROOT` below.
 *
 * ## Why `TOVU_CONTENT_DB=<temp file>`, NOT `TOVU_DB=memory`
 *
 * `playwright.a2ui.config.ts` uses `TOVU_DB=memory`, and this config started out copying that —
 * but memory mode has an undisclosed trap discovered while building this suite (see
 * `ADS-memory/.local-artifacts/reports/20260804-adversarial-surface-and-resilience.md`, Finding 1):
 * the admin HTTP server and the agent daemon are genuinely separate OS processes
 * (`src/index.ts`'s `spawnAgentDaemon`), and in memory mode EACH independently calls
 * `createRouteDeps()`, which mints its own random admin-principal id via `seedIdentity`'s
 * `idGen.newId()`. In-memory SQLite is process-local, so the two processes end up with two DIFFERENT
 * admin principal ids, and the daemon's own `authorize()` never finds the session's principal —
 * every `content.read`/`content.write`-gated agent-tool call 400s `principal_disabled`, always. This
 * was invisible to `a2ui-transport-contract.spec.ts` because none of its cases reach a real
 * `authorize()` call (all negative-path routing: 401/400/409 before any handler runs).
 *
 * A real sqlite FILE fixes it: the main process's boot-time migrations+seed finish before
 * `spawnAgentDaemon()` fires (confirmed in `src/index.ts`'s own ordering), so by the time the daemon
 * opens the SAME file path, the store already has the row and `seedIdentity` is a no-op read of the
 * EXISTING principal — both processes agree on one id. Per this repo's own hard rule, that file is
 * NEVER `infra/content.db` (the owner's real dev database) — a fresh, disposable path in the OS temp
 * directory instead, unique per config-load so concurrent runs cannot collide.
 *
 * `TOVU_ENABLE_DEMO_TOOLS` is deliberately NOT set here, unlike `playwright.a2ui.config.ts`. Demo
 * tools only matter for the A2UI multi-turn exchange path, which needs a live spawned agent CLI to
 * open at all — out of scope for this config's own webServer the same way it was for the a2ui one.
 *
 * Own ports, pinned away from every port already claimed by a concurrent dispatch in this session
 * (4319 daemon default, 3999, 4976, 4977, 4990, 4991, 4998, 4999, 5173): app 4992, daemon 4993.
 */
const PORT = 4992;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DB_PATH = path.join(
  require("node:os").tmpdir(),
  `tovu-adversarial-content-${process.pid}.db`,
);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /surface-(abuse|resilience)\.spec\.ts/,
  // 90s, not the usual 30s: each spec file's own `beforeAll` polls the daemon-ready probe for up to
  // 60s (see `waitForDaemonReady` in both spec files) — a real sqlite file's migrations (this
  // config's `TOVU_CONTENT_DB` fix for Finding 1) can genuinely take that long under concurrent
  // system load, and `beforeAll` shares the enclosing test's timeout budget. A 30s global timeout
  // would kill `beforeAll` itself before the 60s poll could ever succeed.
  timeout: 90_000,
  fullyParallel: false, // several tests deliberately race concurrent requests against shared server state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  // Logs in exactly once (`adversarial.globalSetup.ts`) and hands every test the resulting session
  // cookie via `storageState` — see that file's own header for why per-test login (this suite's
  // original approach) 429s past `LOGIN_STRICT`'s 10-requests/60s cap once there are more than 10
  // tests in the file.
  globalSetup: require.resolve("./e2e/adversarial.globalSetup"),
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
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
    command: `PORT=${PORT} TOVU_CONTENT_DB=${CONTENT_DB_PATH} JINI_AGENT_DAEMON_PORT=4993 node --import tsx src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
