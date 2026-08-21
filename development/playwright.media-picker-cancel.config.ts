import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Dedicated config for `media-picker-cancel.spec.ts` — pins the owner-reported bug: with
 * real media loaded, `MediaPickerDialog`'s Cancel button renders off-screen and unclickable
 * (`.media-picker-grid`/`.media-picker-item` had zero CSS, so the thumbnail grid grew unbounded
 * and pushed the fixed footer past the viewport). Follows `playwright.access-tokens.config.ts`'s
 * exact precedent: `development/playwright.config.ts` cannot run this spec — it hardcodes
 * `testMatch: /theme-visual\.spec\.ts/` and silently ignores every other file regardless of CLI
 * args (confirmed by reading it) — so, like every other spec in this directory, this one needs its
 * own two-process boot (API with `TOVU_DB=memory`, Vite for `apps/admin` pointed at it) and its own
 * reserved port block.
 *
 * A fresh in-memory DB matters here specifically: the spec seeds ~20 real media items through the
 * live upload API before asserting anything, so the dialog actually has content to overflow —
 * against a persisted DB this would double-seed on every rerun.
 *
 * Ports 8011/8012/8013: confirmed free via `lsof` on 2026-08-21, the next free block after the
 * highest reserved block at the time (8001-8003, `playwright.multi-tab-resource-soak.config.ts`).
 */
const API_PORT = 8011;
const ADMIN_PORT = 8012;
const DAEMON_PORT = 8013;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /media-picker-cancel\.spec\.ts/,
  // 60s, not the more common 30s in this directory: this admin SPA's dev-server module graph is
  // large (many `@fs`-imported files from the sibling `Jini` packages, lazily transformed by Vite
  // per navigation) and this suite runs on a machine shared with other concurrent agent sessions —
  // one live run here timed out at 30s on "New Post" never appearing, with the trace showing a
  // batch of aborted (status -1) module fetches under load, not a real app/test defect (a rerun
  // right after, same machine, passed cleanly). 60s gives real headroom without masking an actual
  // hang — this suite still fails loud, just later.
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
