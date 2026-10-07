import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { createIsolatedJourneySite, isolatedJourneyWebServers } from "./e2e/support/isolated-journey-site.js";

/**
 * @file Admin phone-width screenshot baselines (owner 2026-10-07: "take screenshots so we dont
 * regress"). Run: `npx playwright test -c development/playwright.mobile-visual.config.ts`.
 *
 * Its own isolated site rather than a project in `playwright.journeys.config.ts`: every journey
 * there shares one database, so list pages would show whatever random rows earlier journeys left
 * behind and a baseline would compare leftover data, not UI. A fresh site per run holds only the
 * first-boot seed plus the fixed rows this suite creates (and deletes again). SQLite, like the
 * shipped app: media uploads need its first-boot core transforms.
 *
 * The spec ends in `.visual.ts`, not `.journey.ts`, so the journeys config never picks it up.
 * Boot, login (`journeys.globalSetup.ts`, called from `mobile-visual.setup.ts`) and site deletion
 * are the journeys harness's own.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
/** iPhone SE: the owner's reference phone. Chromium, so baselines match the rest of the suite. */
const PHONE = { ...devices["iPhone SE"], defaultBrowserType: undefined, deviceScaleFactor: 1, viewport: { width: 375, height: 667 } };
const LARGE_PHONE = { ...PHONE, viewport: { width: 414, height: 896 } };

export default createIsolatedJourneySite({ suite: "journeys-mobile" }, { database: "sqlite" }).then((site) => defineConfig({
  testDir: "./e2e/journeys",
  testMatch: /mobile-visual\.visual\.ts$/,
  globalSetup: "./e2e/journeys/mobile-visual.setup.ts",
  metadata: { isolatedJourneySite: site },
  timeout: 120_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.002 },
  },
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
  outputDir: path.join(REPO_ROOT, "development/test-results/mobile-visual"),
  reporter: [
    ["list"],
    ["./e2e/support/journey-site-cleanup-reporter.ts", { site }],
  ],
  use: {
    baseURL: site.adminURL,
    storageState: site.storageState,
    browserName: "chromium",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone-375", use: PHONE },
    // List pages only: the 414 run catches card layouts that only break at a wider phone.
    { name: "phone-414", use: LARGE_PHONE, grep: /@list/ },
  ],
  webServer: isolatedJourneyWebServers({ site }),
}));
