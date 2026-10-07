// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * @file Desktop journeys config (E2E scope doc, `ADS-memory/.local-artifacts/e2e-scope/SCOPE.md`
 * §3, D1-D7). Minimal stand-in for the E2E-H2 harness.
 *
 * Same shape as `playwright.desktop-shell.config.ts`, for the same reasons: no `webServer` (the shell
 * spawns its own `tovu serve` children on ports it allocates), the `_electron` driver instead of a
 * browser project, `workers: 1` and `retries: 0` (each journey writes a projects file and spawns
 * real children; a retry would run against state the first attempt mutated).
 *
 * `testMatch` is anchored to `.desktop.ts`: every older config matches an unanchored `...\.spec\.ts`
 * regex under `testDir: ./e2e`, so a desktop journey must never end in `.spec.ts`.
 *
 * Local only: Electron on Linux CI would need xvfb, and CI is off anyway (SCOPE.md §3.3).
 *
 * Set TOVU_DESKTOP_E2E_APP to a released .app bundle or its Contents/MacOS binary to test that
 * build without building/staging dev assets. Setup logs the app path and bundle version. The
 * scratch userData and scrubbed env still apply; source-contract-only smoke checks skip.
 * Example (from the repo root):
 * TOVU_DESKTOP_E2E_APP="/Volumes/Tovu 0.1.12/Tovu.app" npx playwright test --config=development/playwright.desktop-journeys.config.ts
 * Unset: the existing dev Electron launch and fresh-build gate are unchanged.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "./e2e/desktop",
  testMatch: /\.desktop\.ts$/,
  globalSetup: "./e2e/desktop/desktop.globalSetup.ts",
  // Relaunch journeys start the same site twice; a cold `tovu serve` under tsx is over a minute.
  timeout: 420_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.001 },
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}",
  outputDir: path.join(REPO_ROOT, "development/test-results/desktop-journeys"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(REPO_ROOT, "development/playwright-report/desktop-journeys"), open: "never" }],
  ],
  use: { trace: "retain-on-failure" },
  projects: [{ name: "electron" }],
});
