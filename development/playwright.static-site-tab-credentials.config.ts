import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * @file Config for `static-site-tab-credentials.spec.ts` — the Static Site tab's credential-entry
 * UI (2026-08-15), the one built against `ADS-memory/reports/external-audit/runs/
 * 2026-08-15-terra-xhigh-publish-credentials-design.md`. Own config family, not folded into
 * `playwright.static-site-tab.config.ts`, same "independent ports, server flags and teardown per
 * suite" reasoning that file's own header gives (and that file repeats from
 * `playwright.dockerfile-tab.config.ts` before it).
 *
 * Ports 7901/7902/7903: confirmed free via a repo-wide grep of every `playwright.*.config.ts`'s own
 * `API_PORT`/`ADMIN_PORT`/`DAEMON_PORT` constants on 2026-08-15 — the next open slot in the 79xx
 * block after `playwright.static-site-tab.config.ts`'s own 7891-3 and before
 * `playwright.visual-parity.config.ts`'s 7921-3.
 *
 * `TOVU_EXECUTION_MODE=hosted-api-only` is the ONE thing this harness sets that
 * `playwright.static-site-tab.config.ts` does not: this suite exists specifically to prove the
 * `"hosted-api-only"` disclosure and the credential CRUD routes work against a REAL server — the
 * `"self-hosted-cli"` default (unset var) and the disclosure SWITCH itself are already covered at
 * the unit level in `StaticSiteTab.unit.test.tsx`, which is not subject to this suite's real-process
 * constraints. See `src/features/deployments/publish-credentials/execution-mode.ts`'s
 * `executionModeFromEnv` for the exact env contract this relies on.
 *
 * `GITHUB_TOKEN`/`VERCEL_TOKEN` are never set for the API server here, same as
 * `playwright.static-site-tab.config.ts` — this suite only exercises credential CRUD (create/list/
 * edit/delete a STORED, encrypted connection), never a real provider publish, so there is nothing
 * for either env var to do and no path that could reach the real internet.
 */
const API_PORT = 7901;
const ADMIN_PORT = 7902;
const DAEMON_PORT = 7903;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /static-site-tab-credentials\.spec\.ts/,
  // Same 90s (not the usual 45s) as `playwright.static-site-tab.config.ts` — see that file's own
  // header for the first-test cold-compile flake this guards against; this suite shares the same
  // admin dev-server cold-start cost on its own first navigation.
  timeout: 90_000,
  // One worker: parallel logins trip the real `LOGIN_STRICT` rate limiter — every sibling config in
  // this directory that logs in follows the same rule.
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 45_000,
      reuseExistingServer: false,
      env: {
        TOVU_EXECUTION_MODE: "hosted-api-only",
      },
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
