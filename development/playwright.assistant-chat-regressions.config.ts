import { defineConfig, devices } from "@playwright/test";
import { createIsolatedJourneySite, isolatedJourneyWebServers } from "./e2e/support/isolated-journey-site.js";

/**
 * Live-only Claude Code Local CLI suite on its OWN seeded site, API, Vite admin and daemon.
 * Reuses the journeys boot and login; SQLite shares the durable ledger across API/daemon.
 * TOVU_E2E_ADMIN_CHAT=1 opts into real model charges. No external server URL is accepted.
 */
if (process.env.TOVU_E2E_ADMIN_BASE_URL !== undefined) {
  throw new Error("Unset TOVU_E2E_ADMIN_BASE_URL: chat regressions only use the isolated site this config starts");
}

export default (async () => {
  const optedIn = process.env.TOVU_E2E_ADMIN_CHAT === "1";
  // With no opt-in, collect skipped tests without allocating a site, starting servers or logging in.
  const site = optedIn ? await createIsolatedJourneySite(
    { suite: "assistant-chat-regressions" }, { database: "sqlite", runtime: "local-cli" },
  ) : undefined;
  if (site) {
    process.env.E2E_API_PORT = String(site.ports.api);
    process.env.E2E_AGENT_DAEMON_PORT = String(site.ports.daemon);
  }
  return defineConfig({
    testDir: "./e2e",
    testMatch: /assistant-chat-regressions\.spec\.ts$/,
    timeout: 6 * 60_000,
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
