import { defineConfig, devices } from "@playwright/test";
import { createIsolatedJourneySite, isolatedJourneyWebServers } from "./e2e/support/isolated-journey-site.js";

/**
 * Opt-in computed-colour guard for the admin's selected/active accents, on its OWN seeded site,
 * API and Vite admin (no daemon: nothing here runs the assistant). TOVU_E2E_SELECTION_COLORS=1
 * opts in. No external server URL is accepted, so the owner's dev site is never touched.
 */
if (process.env.TOVU_E2E_ADMIN_BASE_URL !== undefined) {
  throw new Error("Unset TOVU_E2E_ADMIN_BASE_URL: selection colour tests only use the isolated site this config starts");
}

export default (async () => {
  const optedIn = process.env.TOVU_E2E_SELECTION_COLORS === "1";
  // With no opt-in, collect skipped tests without allocating a site, starting servers or logging in.
  const site = optedIn ? await createIsolatedJourneySite({ suite: "admin-selection-colors" }) : undefined;
  return defineConfig({
    testDir: "./e2e",
    testMatch: /admin-selection-colors\.spec\.ts$/,
    timeout: 2 * 60_000,
    expect: { timeout: 15_000 },
    workers: 1,
    fullyParallel: false,
    retries: 0,
    forbidOnly: !!process.env.CI,
    reporter: [["list"]],
    globalSetup: site ? "./e2e/journeys/journeys.globalSetup.ts" : undefined,
    metadata: site ? { isolatedJourneySite: site } : {},
    webServer: site ? isolatedJourneyWebServers({ site }) : undefined,
    use: {
      baseURL: site?.adminURL,
      storageState: site?.storageState,
      locale: "en-US",
      viewport: { width: 1440, height: 900 },
      headless: true,
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  });
})();
