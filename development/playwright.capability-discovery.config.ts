import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Hermetic config for `admin-capability-discovery.spec.ts` — the automated, browser-driven
 * successor to a manual check the owner ran by hand in the admin chat (documented in
 * `ADS-memory/reports/2026-08-24-capability-discovery-retrieval-is-not-the-problem.md`). Owner's own
 * words on why this had to become a real test: "this should be completely automated. a user shouldnt
 * have to type anything, remember these will be e2e tests in the future."
 *
 * Two scenarios, both real live agent runs (a genuine `claude` CLI, spawned by the daemon), no
 * mocking of the model:
 *
 * - **A — uncontested**: a compliance/privacy question with no plausible native tool. Measured live:
 *   the agent finds and calls `agent_plugin_ui_ux_design` unprompted. Expected to PASS.
 * - **B — contested**: a "make my site look more polished" question, where a native `theme_*` tool
 *   plausibly fits. Measured live: the plugin ranks #1 in the agent's own `search_tools` query, and
 *   the agent still calls `theme_list` (rank #5) instead, never touching the plugin. Written as a
 *   `test.fail()` in the spec — a real, measured, open defect, not a skip.
 *
 * Sibling to `playwright.live-agent.config.ts` (real spawned CLI, generous per-test timeout, own
 * dedicated config so a multi-minute live run never shares a timeout/webServer budget with fast HTTP
 * suites) and to `playwright.composer-agent-plugin-chip.config.ts` (hermetic two-process boot: API+
 * daemon, then the admin Vite dev server, `workers: 1` for the shared `LOGIN_STRICT` rate limiter,
 * `timeout: 60_000`-class cold-transform budget) — this config needs BOTH: a real browser driving the
 * real admin UI (composer-chip's shape) AND a real multi-minute agent run (live-agent's shape).
 *
 * `TOVU_CONTENT_DB=<tmp file>`, NOT `TOVU_DB=memory` — `playwright.live-agent.config.ts`'s own
 * Finding 1: memory mode gives the daemon subprocess its own disconnected principal store, so a real
 * agent's tool calls would 400 `principal_disabled` before ever reaching a registered tool. A real,
 * on-disk file also gives this spec something to open a second, independent SQLite connection against
 * after the run — see the spec's `readToolAttempts` helper, which is the actual, load-bearing signal
 * this whole suite is built to read (`agent_tool_attempts`, not the rendered transcript — the UI is
 * not a reliable proxy for which tool actually ran, only for what the model said about it).
 *
 * No `TOVU_CAPABILITY_MANIFEST_ARM` set here — the spec itself asserts (rather than assumes) that this
 * process's own env leaves it unset/`off`, which is what reaches the daemon child process spawned by
 * `webServer.command` below (same "worker processes inherit this runner's env" property
 * `playwright.live-agent.config.ts`'s header documents for `E2E_API_PORT`/`E2E_AGENT_DAEMON_PORT`).
 * No plugin is pinned from the composer either — the spec never calls the "+" menu pin flow, so the
 * agent has to find `agent_plugin_ui_ux_design` through ordinary `search_tools` discovery, unaided.
 *
 * Ports 8061/8062/8063: confirmed free via `lsof -iTCP:8061 -iTCP:8062 -iTCP:8063 -sTCP:LISTEN` on
 * 2026-08-24 (exit code 1, no listeners), next unclaimed slot in this directory's `+10`-per-config
 * port ladder (last claimed triple: 8051/8052/8053, `playwright.composer-agent-plugin-chip.config.ts`).
 *
 * ---------------------------------------------------------------------------
 * `TOVU_AGENT_CWD` — the spawned agent's working directory (measured defect, fixed here)
 * ---------------------------------------------------------------------------
 * The FIRST real rerun of this suite (2026-08-24) surfaced a suite-breaking bug, not a product bug:
 * `agent-daemon-server.ts`'s own `agentExecutor.run({ cwd: process.env.TOVU_AGENT_CWD ?? process.cwd()
 * , ... })` falls back to `process.cwd()` when unset, and this config's own API `webServer.command`
 * runs with `cwd: REPO_ROOT` — so, unset, the spawned `claude` CLI's own working directory IS the
 * Tovu checkout itself. Scenario A's prompt asks a privacy/compliance question, and the agent used
 * its OWN built-in Grep/Read tools against Tovu's real source tree (observed live: it dumped
 * `src/server/__specs__/30-auth/auth-and-sessions.spec.md` and an admin settings hook file into the
 * transcript hunting for "privacy") instead of calling any Tovu product tool — burning the whole
 * 5-minute per-turn budget on a search that could never find what it was looking for, and never
 * reaching `agent_tool_attempts` at all on the run that hit this. This is exactly the kind of
 * cwd-dependent behavior `TOVU_AGENT_CWD` exists to override (same "explicit env var, not a bare
 * `process.cwd()`" shape as `TOVU_CONTENT_DB`/`TOVU_MEDIA_UPLOADS_DIR`, per that file's own comment on
 * the sibling `TOVU_CHAT_ATTACHMENTS_DIR`) — it is a real, product-owned, ALREADY-EXISTING setting,
 * not a new one added for this fix. Pointed at a freshly created, empty scratch directory below, so
 * the spawned CLI has no source tree to grep at all, and — as a side effect confirmed by that same
 * property — no repo-local `.claude/settings.json`/`CLAUDE.md` for its own SessionStart hook to load
 * from, closing the leak the 2026-08-24 handoff report's §5.5 separately records ("Tovu's SessionStart
 * hook text... reaches the spawned agent inside Tovu's chat, which has no such tools").
 */
const API_PORT = 8061;
const ADMIN_PORT = 8062;
const DAEMON_PORT = 8063;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");
const CONTENT_DB_PATH = path.join(tmpdir(), `tovu-capability-discovery-content-${process.pid}.db`);
const AGENT_CWD_PATH = path.join(tmpdir(), `tovu-capability-discovery-agent-cwd-${process.pid}`);
mkdirSync(AGENT_CWD_PATH, { recursive: true });

/** Published so `e2e/daemon-ready.ts`'s shared `waitForAgentDaemon()` gates on THIS config's own
 *  ports, and so the spec's own `readToolAttempts` helper can open the same on-disk db this boot's
 *  daemon subprocess actually writes to — worker processes are forked from this runner and inherit
 *  its env, so both values reach the spec unchanged (same pattern `playwright.live-agent.config.ts`
 *  and `playwright.destructive.config.ts` already rely on). */
process.env.E2E_API_PORT = String(API_PORT);
process.env.E2E_AGENT_DAEMON_PORT = String(DAEMON_PORT);
process.env.E2E_CAPABILITY_DISCOVERY_CONTENT_DB = CONTENT_DB_PATH;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-capability-discovery\.spec\.ts/,
  // Two real, sequential, multi-minute live agent runs (scenario A + scenario B) live in this one
  // file — generous per-test timeout, same order of magnitude as `playwright.live-agent.config.ts`.
  // Raised from an initial 6 min to 10 (2026-08-24, team-lead review of the first real rerun): even
  // with the `TOVU_AGENT_CWD` fix above, a genuine multi-tool-call live run can take several minutes,
  // and 300s specifically was observed too tight for the turn-completion wait alone (see the spec's
  // own `waitForTurnToFinish` call sites).
  timeout: 10 * 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // A flaky live-agent run should be investigated, not silently retried and hidden — same rule
  // `playwright.live-agent.config.ts` states for its own single live test.
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_CONTENT_DB=${CONTENT_DB_PATH} TOVU_AGENT_CWD=${AGENT_CWD_PATH} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
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
