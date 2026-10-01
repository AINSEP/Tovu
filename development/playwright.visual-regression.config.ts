import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "@playwright/test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const API_PORT = 8961;
const ADMIN_PORT = 8962;
const DAEMON_PORT = 8963;
const API_URL = `http://localhost:${API_PORT}`;
const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;

// Memory DB alone does not isolate filesystem-backed skills, uploads, or the Sites registry.
// Start from the repo (to resolve tsx), then change cwd BEFORE importing the server entrypoint.
// Product assets resolve from their own module location; mutable site data stays in this temp
// directory. Keep a stable site basename; absolute paths are masked in the spec. The directory
// is disposable runner scratch, never a baseline or an owner's site.
const runtimeDir = mkdtempSync(path.join(os.tmpdir(), "tovu-visual-regression-"));
mkdirSync(path.join(runtimeDir, "sites", "visual-site"), { recursive: true });

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-visual-regression\.spec\.ts$/,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      // At 390x844, 0.1% permits only ~329 changed pixels: enough for isolated rasterization
      // noise, small enough that a missing icon, displaced control, or broken popup fails.
      maxDiffPixelRatio: 0.001,
    },
  },
  // Shared ephemeral DB + strict login limiter: one worker; one UI login per viewport project.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Deliberate baseline updates must be explicit; a missing PNG fails a normal check.
  updateSnapshots: "none",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
  outputDir: path.join(REPO_ROOT, "development/test-results/visual-regression"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(REPO_ROOT, "development/playwright-report/visual-regression"), open: "never" }],
  ],
  use: {
    baseURL: ADMIN_URL,
    browserName: "chromium",
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    headless: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 834, height: 1112 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  // Same fresh TOVU_DB=memory webServer pattern as playwright.config.ts, plus the live admin
  // Vite process used by visual-parity/typeahead suites so captures always exercise current source.
  webServer: [
    {
      command: "node --import tsx --input-type=module -e 'process.chdir(process.env.TOVU_VISUAL_RUNTIME_DIR); await import(process.env.TOVU_VISUAL_ENTRYPOINT)'",
      cwd: REPO_ROOT,
      env: {
        PORT: String(API_PORT),
        TOVU_DB: "memory",
        TOVU_ADMIN_ASSISTANT: "on",
        TOVU_SITE: "visual-site",
        // Override inherited site-dir settings too: resolveSiteRoot gives these precedence.
        TOVU_SITE_DIR: path.join(runtimeDir, "sites", "visual-site"),
        TOVU_SKILLS_DIR: path.join(runtimeDir, "sites", "visual-site", "skills"),
        TOVU_AGENT_PLUGINS_DIR: path.join(runtimeDir, "sites", "visual-site", "agent-plugins"),
        TOVU_MEDIA_UPLOADS_DIR: path.join(runtimeDir, "sites", "visual-site", "uploads"),
        TOVU_DISABLE_DEV_TLS: "1",
        JINI_AGENT_DAEMON_PORT: String(DAEMON_PORT),
        TSX_TSCONFIG_PATH: path.join(REPO_ROOT, "tsconfig.json"),
        TOVU_VISUAL_RUNTIME_DIR: runtimeDir,
        TOVU_VISUAL_ENTRYPOINT: pathToFileURL(path.join(REPO_ROOT, "apps/website/src/index.ts")).href,
      },
      url: API_URL,
      timeout: 60_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `node node_modules/vite/bin/vite.js --port ${ADMIN_PORT} --strictPort`,
      cwd: path.join(REPO_ROOT, "apps/admin"),
      env: { TOVU_API_URL: API_URL, VITE_TOVU_SITE_URL: API_URL, TOVU_DISABLE_DEV_TLS: "1" },
      url: `${ADMIN_URL}/admin/`,
      timeout: 60_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
