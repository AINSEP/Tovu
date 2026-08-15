import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Config for `static-site-tab.spec.ts` — the Deployment panel's Static Site tab going from
 * "Build static export" permanently inert (and a single joint gh+vercel recommendation) to a real
 * trigger+poll build action plus a per-provider publish flow (2026-08-15). Own config family, not
 * folded into an existing one, same "independent ports, server flags and teardown per suite"
 * reasoning `playwright.dockerfile-tab.config.ts`'s own header gives (and that file repeats from
 * `playwright.pages.config.ts` before it).
 *
 * Ports 7891/7892/7893: confirmed free via `lsof` on 2026-08-15 — the next open slot in the 78xx
 * block after `playwright.dockerfile-tab.config.ts`'s own 7881-3 and before
 * `playwright.visual-parity.config.ts`'s 7921-3.
 *
 * `TOVU_EXPORT_DIR` points the real exporter at a scratch temp directory rather than this repo's own
 * `infra/export` — the spec's "Build static export" test is a REAL export (per the brief: "a real
 * export to disk is fine"), and this is what keeps it from writing into the checked-out repo, same
 * knob `export-site-route.test.ts` uses server-side.
 *
 * `PATH` for the API server is the real one with ONE scratch directory PREPENDED, containing a
 * fake `gh` (a plain empty file — `isOnPath`'s own `existsSync` check never executes it, so it does
 * not need to be a real script). This makes `deployClis` report `gh: true` for real, over the real
 * HTTP route, for this suite's "only-gh-installed" browser-level proof. It does NOT force `vercel`
 * to `false` — that would need REMOVING every real system PATH entry, which risks breaking `node`/
 * `npx` resolution for the webServer command itself. The suite's own header documents this as a
 * best-effort assumption (the runner's own PATH does not already have a real `vercel` CLI); the
 * reverse case (`vercel: true`/`gh: false`, and the read-only DI-seam proof that only one tool's row
 * ever renders) is covered at the unit level instead, in `StaticSiteTab.unit.test.tsx`, which is not
 * subject to this same real-PATH constraint.
 */
const API_PORT = 7891;
const ADMIN_PORT = 7892;
const DAEMON_PORT = 7893;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

const exportScratchDir = mkdtempSync(path.join(tmpdir(), "tovu-static-site-tab-export-"));
const fakeGhBinDir = mkdtempSync(path.join(tmpdir(), "tovu-static-site-tab-fake-gh-"));
writeFileSync(path.join(fakeGhBinDir, "gh"), "");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /static-site-tab\.spec\.ts/,
  // 90s, not the usual 45s a sibling config here uses: whichever test in this file runs FIRST pays
  // a real, one-time Vite cold-compile cost on its first navigation against a JUST-booted webServer
  // (the `webServer.url` readiness check only proves the dev server answered a request, not that
  // the admin app's module graph is pre-transformed) — confirmed live 2026-08-15, reproducibly, on
  // a machine running several concurrent agent sessions (load average ~68): the first test's own
  // `beforeEach` login navigation timed out at 45s while every other test in the same run, sharing
  // the now-warm server, passed in 17-26s. Every LATER test in the file stays fast regardless.
  timeout: 90_000,
  // One worker: parallel logins trip the real `LOGIN_STRICT` rate limiter (discovered live by
  // `playwright.admin.config.ts`) — every sibling config in this directory that logs in follows the
  // same rule.
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
        TOVU_EXPORT_DIR: exportScratchDir,
        // Deliberately never set: GITHUB_TOKEN / VERCEL_TOKEN — the publish half of this suite
        // must never be able to reach a real provider even if it tried; see this file's own header
        // and the spec's own "never touches the real internet" comment.
        PATH: `${fakeGhBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
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
