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
  /**
   * Narrowed to this suite's own spec, deliberately. `e2e/` is no longer this config's private
   * directory — it is now shared with `playwright.site-assistant.config.ts`'s four
   * `site-assistant-*.spec.ts` files and `playwright.a2ui.config.ts`'s `a2ui-transport-contract.spec.ts`
   * (and, as of this pass, several more: `login.spec.ts`, `byok-*.spec.ts`, `surface-abuse.spec.ts`),
   * each of which needs its OWN server (different env, different ledger settings, some with the
   * assistant/demo gates on, this one with them off). Without `testMatch`, this config's default
   * `**\/*.spec.ts` collects every sibling that lands in `e2e/` — present or future — and runs it
   * against THIS config's plain, assistant-disabled, demo-off server, producing failures that read
   * like product bugs but are really "wrong suite, wrong server." Confirmed live 2026-08-04: with no
   * `testMatch`, `--list` here enumerated 67 tests across 11 files, not the 4 `theme-visual.spec.ts`
   * tests this config actually boots a matching server for. A new spec file landing in `e2e/` is
   * SILENTLY adopted by every unscoped sibling config unless each one opts out like this.
   */
  testMatch: /theme-visual\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Deliberately NOT `!process.env.CI` — reusing a pre-existing (possibly stale-themed) server
  // would defeat the fresh-boot-per-run guarantee this VRT suite depends on. Always boot fresh.
  // `outputFolder` is pinned rather than left to default: the html reporter's default resolves
  // relative to the CWD (the repo root, where `npm run test:visual` is invoked), not to this
  // config's own directory — so without it the report lands back at the repo root that this
  // config was moved out of. `testDir` above needs no such treatment; that one IS resolved
  // relative to this file.
  reporter: [["html", { outputFolder: "playwright-report" }]],
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
