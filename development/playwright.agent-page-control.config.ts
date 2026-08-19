import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Config for `agent-page-control-live-verification.spec.ts` — the live verification
 * ADS-memory/reports/2026-08-15-agent-page-control-readpath-verification.md's own "one gap left"
 * asked for: does the `data-agent-element`/`agentHandle()` read path actually work, live, against a
 * real rendered admin tab and (for the top level) a real spawned CLI agent — not just a static trace.
 *
 * Same two/three-process harness every sibling config in this directory uses (`playwright.static-
 * site-tab.config.ts`'s own header explains the "independent ports, server flags and teardown per
 * suite" reasoning this repeats). Real `claude` CLI on `PATH`, unmodified — this suite's top level
 * needs it (same precedent `playwright.live-agent.config.ts` established for
 * `surface-live-agent.spec.ts`), so nothing here touches `PATH`.
 *
 * Ports 7911/7912/7913: confirmed free via `lsof` on 2026-08-15 — the next open slot in the 79xx
 * block after `playwright.static-site-tab-credentials.config.ts`'s own 7901-3 and before
 * `playwright.visual-parity.config.ts`'s 7921-3.
 *
 * `TOVU_DB=memory`, matching every sibling config — this suite reads/writes nothing that needs to
 * survive the process, and no credential is ever actually saved (the LEVEL 1 test types into the
 * access-token field and reads it back/overwrites it in place; it never clicks Save).
 */
const API_PORT = 7911;
const ADMIN_PORT = 7912;
const DAEMON_PORT = 7913;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

// Published so the spec's own daemon-readiness wait (mirroring `e2e/daemon-ready.ts`'s
// `waitForAgentDaemon` convention) can target THIS config's own ports rather than another
// suite's defaults — worker processes are forked from this runner and inherit its env.
process.env.E2E_API_PORT = String(API_PORT);
process.env.E2E_AGENT_DAEMON_PORT = String(DAEMON_PORT);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /agent-page-control-live-verification\.spec\.ts/,
  // The LEVEL 3 test starts a real `claude` CLI run — same generous budget
  // `playwright.live-agent.config.ts` gives `surface-live-agent.spec.ts` for the same reason.
  timeout: 6 * 60_000,
  // One worker: parallel logins trip the real `LOGIN_STRICT` rate limiter, same rule every sibling
  // config in this directory that logs in follows. Also required for LEVEL 3's own reason: the run
  // must bind to the SAME browser tab LEVEL 1/2 already opened and left attached.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // a flaky live-agent step should be investigated, not silently retried and hidden
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 45_000,
      reuseExistingServer: false,
      // `node --import tsx src/index.ts` boots two processes; a SIGKILL on the wrapper orphans the
      // child still bound to the port, and the next run dies EADDRINUSE looking like flake.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 45_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
