// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { createIsolatedJourneySite, isolatedJourneyWebServers } from "./e2e/support/isolated-journey-site.js";
import { CODEX_JOURNEY } from "./e2e/support/assistant-journey-state.js";

/**
 * @file Journeys config (E2E scope doc, `ADS-memory/.local-artifacts/e2e-scope/SCOPE.md` §4).
 *
 * Hermetic sites with seeded admin credentials, blanked vendor keys, and one login per site
 * reused through storageState. Media uses its own SQLite site so first-boot core transforms are
 * registered as in the shipped app; other journeys keep their existing database selection.
 * Boot code is shared with the live chat suite;
 * that suite selects SQLite and the real Claude Local CLI instead of the journeys' browser stubs.
 *
 * `testMatch` is anchored to `.journey.ts` on purpose: every older config matches an unanchored
 * `...\.spec\.ts` regex under `testDir: ./e2e`, so a journey must never end in `.spec.ts`.
 * Ports 9101-9103 serve the default project; media uses the helper's free-port selection.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
export default Promise.all([
  createIsolatedJourneySite(
    { suite: "journeys" }, { ports: { api: 9101, admin: 9102, daemon: 9103 },
      ...(CODEX_JOURNEY ? { database: "sqlite", runtime: "local-cli" } as const : {}) },
  ),
  createIsolatedJourneySite({ suite: "journeys-media" }, { database: "sqlite" }),
]).then(([site, mediaSite]) => defineConfig({
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
  // One worker: serial journeys and the LOGIN_STRICT limiter (10 logins / 60s / IP).
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
  outputDir: path.join(REPO_ROOT, "development/test-results/journeys"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(REPO_ROOT, "development/playwright-report/journeys"), open: "never" }],
    ["./e2e/support/journey-site-cleanup-reporter.ts", { sites: [site, mediaSite] }],
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
  projects: [
    { name: "chromium", testIgnore: /(?:^|\/)media\.journey\.ts$/ },
    {
      name: "chromium-media", testMatch: /(?:^|\/)media\.journey\.ts$/,
      metadata: { isolatedJourneySite: mediaSite },
      use: { baseURL: mediaSite.adminURL, storageState: mediaSite.storageState },
      // Keep the established media screenshot paths when selecting a separate project.
      snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-chromium-{platform}{ext}",
    },
  ],
  webServer: [
    ...isolatedJourneyWebServers({ site }),
    ...isolatedJourneyWebServers({ site: mediaSite }),
  ],
}));
