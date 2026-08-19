import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * @file Live-agent config for `ai-menu-widget-embeds.spec.ts` — the owner's own ask: "run an AI
 * test to create a menu and then also put that in a post and a page. And also a widget."
 *
 * Modeled directly on `playwright.live-agent.config.ts` (own ports, own `TOVU_CONTENT_DB` temp file,
 * `webServer` spawns the real app + real agent daemon, `E2E_API_PORT`/`E2E_AGENT_DAEMON_PORT`
 * published for `e2e/daemon-ready.ts`'s `waitForAgentDaemon()`). Kept as its own config for the same
 * reason: a real agent run costs real time/money and must never share a `webServer`/timeout budget
 * with the fast HTTP-level suites.
 *
 * This spec's run is a longer tool-call SEQUENCE than `surface-live-agent.spec.ts`'s single call
 * (menu -> two widgets -> a page -> an html write -> a post -> one deliberately-failing embed
 * attempt), so its own timeout budget is larger.
 *
 * Own ports, distinct from every other config in this repo (4319 daemon-token port, 3999, 4976,
 * 4977, 4990/4991 destructive, 4992/4993 adversarial, 4996/4997 live-agent + site-assistant, 4999
 * login, 4003 pages, 6421+ byok, 7821-7823/7831-7833 admin-fab): app 4994, daemon 4995.
 */
const PORT = 4994;
const DAEMON_PORT = 4995;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DB_PATH = path.join(
  require("node:os").tmpdir(),
  `tovu-ai-menu-widget-embeds-content-${process.pid}.db`,
);

process.env.E2E_API_PORT = String(PORT);
process.env.E2E_AGENT_DAEMON_PORT = String(DAEMON_PORT);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /ai-menu-widget-embeds\.spec\.ts/,
  // A real multi-step agent run is the long pole here, not browser/network work.
  timeout: 10 * 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // a flaky live-agent run should be investigated, not silently retried and hidden
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // TOVU_CONTENT_DB, not TOVU_DB=memory — memory mode gives the daemon subprocess its own
    // disconnected principal store, so a real agent's tool calls 400 principal_disabled before ever
    // reaching a real tool (same trap `playwright.live-agent.config.ts` documents).
    command: `PORT=${PORT} TOVU_CONTENT_DB=${CONTENT_DB_PATH} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
