import { spawnSync } from "node:child_process";

// Translate the public npm-script variable into the existing desktop harness contract.
const appPath = process.env.TOVU_E2E_DESKTOP_APP;
if (!appPath?.trim()) throw new Error("Set TOVU_E2E_DESKTOP_APP to the packaged Tovu.app or its executable");
const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
  "--config=development/playwright.desktop-journeys.config.ts", ...process.argv.slice(2)], {
  // Node 24.2's synchronous loader breaks CommonJS cycles (nodejs/node#58515).
  // Playwright's existing async loader supports the same harness without changing Node.
  stdio: "inherit", env: { ...process.env, TOVU_DESKTOP_E2E_APP: appPath, PLAYWRIGHT_FORCE_ASYNC_LOADER: "1" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
