import { spawnSync } from "node:child_process";

// Translate the public npm-script variable into the existing desktop harness contract.
const appPath = process.env.TOVU_E2E_DESKTOP_APP;
if (!appPath?.trim()) throw new Error("Set TOVU_E2E_DESKTOP_APP to the packaged Tovu.app or its executable");
const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
  "--config=development/playwright.desktop-journeys.config.ts", ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, TOVU_DESKTOP_E2E_APP: appPath },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
