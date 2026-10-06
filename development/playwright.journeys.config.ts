// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { createIsolatedJourneySite, isolatedJourneyWebServers } from "./e2e/support/isolated-journey-site.js";

/**
 * @file Journeys config (E2E scope doc, `ADS-memory/.local-artifacts/e2e-scope/SCOPE.md` §4).
 *
 * One hermetic boot (memory DB plus a temp runtime dir), seeded admin credentials, blanked vendor
 * keys, and one login reused through storageState. Boot code is shared with the live chat suite;
 * that suite selects SQLite and the real Claude Local CLI instead of the journeys' browser stubs.
 *
 * `testMatch` is anchored to `.journey.ts` on purpose: every older config matches an unanchored
 * `...\.spec\.ts` regex under `testDir: ./e2e`, so a journey must never end in `.spec.ts`.
 * Ports 9101-9103 are the range SCOPE.md reserves for the new configs.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
export default createIsolatedJourneySite(
  { suite: "journeys" }, { ports: { api: 9101, admin: 9102, daemon: 9103 } },
).then((site) => defineConfig({
  testDir: "./e2e/journeys",
  testMatch: /\.journey\.ts$/,
  grepInvert: /@live/,
  globalSetup: "./e2e/journeys/journeys.globalSetup.ts",
  metadata: { isolatedJourneySite: site },
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.001 },
  },
  // One worker: one shared memory DB and the LOGIN_STRICT limiter (10 logins / 60s / IP).
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
  outputDir: path.join(REPO_ROOT, "development/test-results/journeys"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(REPO_ROOT, "development/playwright-report/journeys"), open: "never" }],
  ],
  use: {
    baseURL: site.adminURL,
    storageState: site.storageState,
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    viewport: { width: 1440, height: 900 },
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium" }],
  webServer: isolatedJourneyWebServers({ site }),
}));
