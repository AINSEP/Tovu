/** Opt-in workloads only. Build the compiled CLI and admin before invoking either npm script. */
import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { createIsolatedJourneySite } from "./e2e/support/isolated-journey-site.js";

if (process.env.TOVU_E2E_PACKAGED_APP || process.env.TOVU_DESKTOP_E2E_APP) throw new Error("Memory soaks require this checkout's source desktop and compiled CLI");
const repoRoot = path.resolve(import.meta.dirname, "..");
export default createIsolatedJourneySite({ suite: "journeys-memory-soak" }, { database: "sqlite" }).then(site => {
  const { env } = JSON.parse(readFileSync(site.manifestPath, "utf8"));
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  return defineConfig({
    testDir: "./e2e/soak", testMatch: /\.soak\.ts$/,
    workers: 1, retries: 0, fullyParallel: false, forbidOnly: !!process.env.CI,
    metadata: { isolatedJourneySite: site },
    outputDir: path.join(repoRoot, "development/test-results/memory-soak/diagnostics"),
    reporter: [["list"], ["./e2e/support/journey-site-cleanup-reporter.ts", { site }]],
    // Traces can contain inspector/capture capabilities or cookies; evidence is sanitized JSON.
    use: { baseURL: site.apiURL, trace: "off", screenshot: "off", video: "off" },
    projects: [
      { name: "server", testMatch: /server\.soak\.ts$/, timeout: 600_000 },
      { name: "desktop", testMatch: /desktop\.soak\.ts$/, timeout: 900_000 },
    ],
    webServer: {
      command: `node --import tsx development/e2e/support/start-journey-site.mjs ${quote(site.manifestPath)} soak`,
      cwd: repoRoot, env, url: `${site.apiURL}/admin/`, timeout: 240_000, reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    },
  });
});
