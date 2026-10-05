// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * @file Journeys config (E2E scope doc, `ADS-memory/.local-artifacts/e2e-scope/SCOPE.md` §4).
 *
 * Minimal stand-in for the E2E-H1 harness, which does not exist yet: one hermetic boot (memory DB
 * plus a temp runtime dir for uploads, skills, agent plugins and site plugins), explicit admin
 * credentials on both sides, blanked vendor keys, and one login in globalSetup reused through
 * `storageState`. H1 should replace the inline env below with `harness/env.ts` when it lands.
 *
 * `testMatch` is anchored to `.journey.ts` on purpose: every older config matches an unanchored
 * `...\.spec\.ts` regex under `testDir: ./e2e`, so a journey must never end in `.spec.ts`.
 * Ports 9101-9103 are the range SCOPE.md reserves for the new configs.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const JOURNEY_API_PORT = 9101; // Mirrored in e2e/journeys/_fixtures.ts (importing this file would mkdtemp again).
const JOURNEY_ADMIN_PORT = 9102;
const DAEMON_PORT = 9103;
const API_URL = `http://localhost:${JOURNEY_API_PORT}`;
const ADMIN_URL = `http://localhost:${JOURNEY_ADMIN_PORT}`;
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "tovu-journeys";

const runtimeDir = mkdtempSync(path.join(os.tmpdir(), "tovu-journeys-"));
const siteDir = path.join(runtimeDir, "sites", "journey-site");
mkdirSync(siteDir, { recursive: true });

export default defineConfig({
  testDir: "./e2e/journeys",
  testMatch: /\.journey\.ts$/,
  grepInvert: /@live/,
  globalSetup: "./e2e/journeys/journeys.globalSetup.ts",
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
    baseURL: ADMIN_URL,
    storageState: path.join(os.tmpdir(), "tovu-journeys-auth", "storage-state.json"),
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
  webServer: [
    {
      command: "node --import tsx apps/website/src/index.ts",
      cwd: REPO_ROOT,
      env: {
        PORT: String(JOURNEY_API_PORT),
        TOVU_DB: "memory",
        TOVU_ADMIN_USER: ADMIN_USER,
        TOVU_ADMIN_PASSWORD: ADMIN_PASSWORD,
        TOVU_ADMIN_ASSISTANT: "on",
        TOVU_SITE: "journey-site",
        TOVU_SITE_DIR: siteDir,
        TOVU_SKILLS_DIR: path.join(siteDir, "skills"),
        TOVU_AGENT_PLUGINS_DIR: path.join(siteDir, "agent-plugins"),
        TOVU_PLUGINS_DIR: path.join(siteDir, "plugins"),
        TOVU_MEDIA_UPLOADS_DIR: path.join(siteDir, "uploads"),
        TOVU_PLUGIN_LOCAL_INSTALL: "1",
        TOVU_INTEGRATIONS_ROOT_KEY: "a".repeat(64),
        TOVU_DISABLE_DEV_TLS: "1",
        JINI_AGENT_DAEMON_PORT: String(DAEMON_PORT),
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
        GEMINI_API_KEY: "",
        GOOGLE_API_KEY: "",
      },
      url: API_URL,
      timeout: 90_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `node node_modules/vite/bin/vite.js --port ${JOURNEY_ADMIN_PORT} --strictPort`,
      cwd: path.join(REPO_ROOT, "apps/admin"),
      env: { TOVU_API_URL: API_URL, VITE_TOVU_SITE_URL: API_URL, TOVU_DISABLE_DEV_TLS: "1" },
      url: `${ADMIN_URL}/admin/`,
      timeout: 90_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
