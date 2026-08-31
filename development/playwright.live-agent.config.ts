import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * @file The ONE live-agent spec in this dispatch: `surface-live-agent.spec.ts`, exercising
 * `content_post_delete`'s real positive path — a genuine spawned agent CLI (`claude`, confirmed on
 * `PATH` in this environment), a real SSE run-events stream, a real `mcp-ui` surface, and a real
 * browser-shaped delivery POST completing the held-open call.
 *
 * A dedicated config, not a reuse of `playwright.adversarial.config.ts`, for one reason: cost. A real
 * agent run takes on the order of minutes (team lead's own estimate: ~$0.20, ~3 minutes), which would
 * blow out the adversarial suite's fast, cheap-to-rerun HTTP-level tests if the two shared a
 * `webServer`/timeout budget. Kept separate so the HTTP suite stays fast to rerun and this one stays
 * clearly opt-in (own npx invocation, own report line).
 *
 * This run needs nothing env-gated: `content_post_delete` is a real production tool. (It also used
 * to be worth saying that `TOVU_ENABLE_DEMO_TOOLS` was deliberately unset here; that var stopped
 * existing on 2026-08-26, when the in-chat UI tools were un-gated.)
 *
 * Own ports, distinct from every other port claimed in this session (4319, 3999, 4976, 4977, 4990,
 * 4991, 4998, 4999, 5173, and this dispatch's own 4992/4993/4995 already used by
 * `playwright.adversarial.config.ts`'s suite): app 4996, daemon 4997.
 */
const PORT = 4996;
const DAEMON_PORT = 4997;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DB_PATH = path.join(
  tmpdir(),
  `tovu-live-agent-content-${process.pid}.db`,
);

/**
 * Published so `e2e/daemon-ready.ts`'s shared `waitForAgentDaemon()`/`isDaemonKnownFailed()` gate on
 * THIS config's own ports instead of its defaults (`playwright.destructive.config.ts`'s 4990/4991) —
 * this spec previously rolled its own `waitForDaemonReady`, which polled `a2ui-actions-route.ts`, a
 * route with no dependency on the agent daemon at all (confirmed: no `fetch`, no daemon import), so it
 * could never actually observe daemon readiness. Same pattern `playwright.destructive.config.ts` uses:
 * worker processes are forked from this runner and inherit its env, so the value reaches the spec.
 */
process.env.E2E_API_PORT = String(PORT);
process.env.E2E_AGENT_DAEMON_PORT = String(DAEMON_PORT);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /surface-live-agent\.spec\.ts/,
  // A real agent run is the long pole here, not browser/network work — generous per-test timeout.
  timeout: 6 * 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // a flaky live-agent run should be investigated, not silently retried and hidden
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // `TOVU_CONTENT_DB`, not `TOVU_DB=memory` — see `playwright.adversarial.config.ts`'s header and
    // this dispatch's Finding 1: memory mode gives the daemon subprocess its own disconnected
    // principal store, so a real agent's tool calls would 400 `principal_disabled` before ever
    // reaching `content_post_delete`.
    command: `PORT=${PORT} TOVU_CONTENT_DB=${CONTENT_DB_PATH} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx apps/website/src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
