import { defineConfig, devices } from "@playwright/test";

/**
 * @file Visual regression testing (VRT) config — todos.md AW-2.
 *
 * Boots a fresh, hermetic in-memory server (`TOVU_DB=memory`) per test run via the `webServer`
 * block below, so every run renders the theme exactly as it is on disk right now — the server
 * caches the theme at boot with no hot-reload of `themes/**`, so a *fresh* boot per run is what
 * keeps this from silently testing a stale theme. `reuseExistingServer` is explicitly disabled
 * in CI and left off locally too (see below) so a stale long-running dev server can never serve
 * these tests.
 */
const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Deliberately NOT `!process.env.CI` — reusing a pre-existing (possibly stale-themed) server
  // would defeat the fresh-boot-per-run guarantee this VRT suite depends on. Always boot fresh.
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Pin explicitly rather than relying on a device preset default, per todos.md's
    // anti-flake list ("pin viewport/deviceScaleFactor explicitly").
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    headless: true,
  },
  expect: {
    toHaveScreenshot: {
      // Small, non-zero threshold to absorb anti-aliasing/subpixel noise without masking
      // real drift (todos.md: "small maxDiffPixelRatio").
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `PORT=${PORT} TOVU_DB=memory node --import tsx src/index.ts`,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
