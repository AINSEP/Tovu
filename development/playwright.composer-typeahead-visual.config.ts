import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Visual regression (pixel-diff) config for the admin assistant composer type-ahead ("/")
 * menu — the reference implementation for the VRT paradigm documented in
 * `ADS-memory/reports/2026-08-21-visual-regression-testing-paradigm.md`.
 *
 * Sibling to `playwright.composer-discovery.config.ts` / `playwright.composer-discovery-scroll.config.ts`
 * (same "fresh, small, dedicated config per topic-specific spec" rationale those two document), but
 * this one adds a THIRD kind of coverage next to their geometric bounding-box assertions: a pixel
 * screenshot diff. `admin-composer-discovery-menu-overlap.spec.ts` proves the menu does not overlap
 * the textarea; it cannot prove the menu isn't visually broken in some other way (wrong font, a
 * missing icon, collapsed padding, wrong colors) — that's what THIS config's spec exists to catch,
 * per the owner's own named example: "typing `/` and seeing a mangled menu."
 *
 * Same hermetic two-process boot as its siblings (`TOVU_DB=memory` API + Vite `apps/admin`,
 * `workers: 1` for the shared `LOGIN_STRICT` rate limiter), and the same live-Vite-dev-mode
 * dependency on `@jini-ai/chat`'s built `dist/` (not `src/`) for `.jini-composer-*` styles.
 *
 * `maxDiffPixelRatio: 0.02` matches `playwright.config.ts` (theme-visual, AW-2) — the one existing
 * VRT precedent in this repo — rather than inventing a new tolerance.
 *
 * Ports 8041/8042/8043: confirmed free via `lsof` on 2026-08-21, next unclaimed slot in this
 * directory's own `+10`-per-config port ladder (last claimed triple before this one: 8031/8032/8033,
 * `playwright.composer-discovery-scroll.config.ts`).
 *
 * `timeout: 60_000`, not this directory's more common `30_000`: reproduced live twice — the FIRST
 * test in the file (whichever one happens to run first) pays Vite dev-mode's cold JIT-transform cost
 * for the login page's full module graph and blows a 30s budget by itself (measured: 30.7s, twice,
 * both times on the first test only — every later test in the same run, same warmed Vite process,
 * finished in 15-17s). Matches the same tradeoff `playwright.visual-parity.config.ts` and
 * `playwright.media-picker-cancel.config.ts` already made for other admin-app suites.
 */
const API_PORT = 8041;
const ADMIN_PORT = 8042;
const DAEMON_PORT = 8043;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-composer-typeahead-visual\.spec\.ts/,
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
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
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
