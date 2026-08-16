import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Regression config for the admin shell's phantom vertical document scroll (2026-08-15,
 * owner-reported as "a bunch of white space" below the Deployment page).
 *
 * A dedicated config, following `playwright.deployment-tabbar-scroll.config.ts`'s precedent exactly
 * (same two-process boot: the API on its own port with `TOVU_DB=memory`, then Vite for `apps/admin`
 * on a second port with `TOVU_API_URL` pointed at the first). Same reason a dedicated config is
 * required rather than a `testMatch` bolted onto a sibling: `e2e/` is shared by two dozen configs,
 * and an unscoped one silently adopts every new spec that lands there and runs it against the wrong
 * server — see `playwright.config.ts`'s own comment for the 67-tests-instead-of-4 incident.
 *
 * Live Vite dev-mode render is mandatory here. This is a pure layout defect — an element's
 * containing block resolving to the initial containing block and stretching `document.scrollHeight`
 * past the viewport — and jsdom has no layout engine, so no unit test at any level can observe it.
 *
 * Ports 7881/7882/7883: confirmed free via `lsof` on 2026-08-15 against every other config's own
 * documented reservation (nearest neighbors: 7871-3 deployment-tabbar-scroll, 7921-3 visual-parity).
 */
const API_PORT = 7881;
const ADMIN_PORT = 7882;
const DAEMON_PORT = 7883;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-shell-no-document-scroll\.spec\.ts/,
  timeout: 30_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Pinned deliberately, and SHORTER than the content it renders. The bug is "the document
    // scrolls when the shell says it cannot", which is only observable when the page content
    // actually overflows the viewport — a tall viewport that fits everything hides it.
    viewport: { width: 1440, height: 720 },
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
      cwd: REPO_ROOT,
      url: API_BASE_URL,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `TOVU_API_URL=${API_BASE_URL} npx vite --port ${ADMIN_PORT} --strictPort`,
      cwd: ADMIN_ROOT,
      url: `${BASE_URL}/admin/`,
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
