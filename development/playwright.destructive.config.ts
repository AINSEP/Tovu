import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Login + destructive-return-path E2E config (ADR-055 Decision 2 verification, 2026-08-04
 * dispatch: "Login + destructive-path e2e").
 *
 * Modeled directly on `playwright.a2ui.config.ts` — the proven precedent for booting this app under
 * Playwright — copying the two things that config's own header documents as load-bearing:
 *
 * 1. `testDir: "./e2e"` + a `testMatch` narrow enough to not also collect every other suite's specs
 *    living in the same directory (`a2ui-*.spec.ts`, `byok-*.spec.ts`, `site-assistant-*.spec.ts`,
 *    `theme-visual.spec.ts`, …).
 * 2. An EXPLICIT `webServer.cwd` set to the repo root. Playwright resolves `webServer.command`
 *    against the CONFIG FILE's own directory (`development/`) when `cwd` is omitted, not the repo
 *    root — `node --import tsx src/index.ts` would then resolve to the nonexistent
 *    `development/src/index.ts` and the server would never boot. Confirmed as a real, pre-existing
 *    trap in the shared `playwright.config.ts` by `playwright.a2ui.config.ts`'s own header;
 *    sidestepped here the same way `a2ui` and `resilience` already do.
 *
 * ## Why `TOVU_CONTENT_DB=<fresh temp file>`, not `TOVU_DB=memory`
 *
 * This app's `node --import tsx src/index.ts` boots TWO processes even from one command: the main
 * server, and an agent-daemon subprocess it spawns (`spawnAgentDaemon()`) — confirmed by `lsof`
 * showing two independent listeners (app port + `JINI_AGENT_DAEMON_PORT`) from one invocation. Each
 * calls `createRouteDeps()` independently. With `TOVU_DB=memory`, in-memory SQLite is process-local,
 * so each process seeds its OWN random admin-principal UUID — the daemon's `authorize()` then never
 * finds the session's principal, and every `content.read`/`content.write`-gated agent-tool call
 * 400s `principal_disabled`, 100% of the time (diagnosed by `adversarial-surface-resilience`,
 * confirmed here). `login.spec.ts` never touches the daemon/tool-call path, so this was invisible
 * there — it only bites `destructive-path.spec.ts`'s real tool calls. `TOVU_CONTENT_DB=<file>`
 * fixes it: the main process seeds the file before the daemon spawns, the daemon opens the same
 * non-empty file and skips reseeding, and both end up with the same principal id. The file is a
 * fresh path under `os.tmpdir()`, generated once per config load — never `infra/content.db` (a
 * prior session broke the owner's real admin login by holding that file open across a hung
 * server), and never reused across runs (a stale file would already be seeded, so a fresh boot
 * would skip seeding into it and silently diverge from what these tests assume is present).
 *
 * Ports: app 4991, daemon 4990 — this dispatch's assigned pair, chosen free of every port already
 * reserved as of 2026-08-04 (4319 real daemon default, 3999 VRT, 4976/4977/4992/4993 BYOK-adjacent,
 * 4998/4999 a2ui, 5173 Vite default).
 *
 * ## A one-time crash, investigated, found to have a real (now fixed) cause, but not reliably
 * reproducible from this suite's own runs — recorded here so it isn't re-discovered from scratch
 *
 * On this suite's FIRST ever run, `login.spec.ts`'s "valid credentials" case hit an uncaught
 * `TypeError: Cannot read properties of null (reading 'useState')` inside React, thrown while
 * mounting the post-login admin shell — captured via a real `page.on("pageerror")` listener, not
 * inferred. Investigation (see `ADS-memory/.local-artifacts/reports/
 * 20260804-e2e-login-and-destructive-path.md` for the full trace) found a real cause — four
 * `file:`-linked sibling packages (`@jini-ai/admin`, `@jini-ai/chat`, `@jini-ai/ui`,
 * `@jini-ai/renderers-react`) each carried their own nested `node_modules/react`, separate from
 * `apps/admin`'s own, the classic setup for a duplicate-React-instance hook crash. The SAME test
 * then passed cleanly on the next 9 consecutive attempts before any fix existed, so the causal link
 * to this specific crash was never proven from this suite's evidence alone — but the hazard itself
 * was confirmed independently (distinct `react.transitional.element` registrations in the built
 * bundle measured 5 → 3, ~12KB smaller bundle) and fixed in `apps/admin/vite.config.ts`
 * (`resolve.dedupe`, commit `d344758`). Rebuild (`npm --prefix apps/admin run build`) before running
 * this config, or the fix does not reach it.
 *
 * `workers: 1`, not `fullyParallel`: every spec logs in through the REAL `LOGIN_STRICT` rate
 * limiter (`src/server/middleware/rate-limit.ts`, consulted by `dev-auth.ts`'s login route) — same
 * reasoning `playwright.admin.config.ts` (BYOK) documents for pinning to one worker.
 */
const PORT = 4991;
const DAEMON_PORT = 4990;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DB_PATH = path.join(os.tmpdir(), `tovu-e2e-destructive-content-${Date.now()}-${process.pid}.db`);

/**
 * Published alongside `E2E_AGENT_DAEMON_PORT` below so `e2e/daemon-ready.ts` can poll THIS config's
 * own API port's `/readyz` — not just bare-TCP-connect the daemon's port — before trusting a
 * connect as proof the daemon we just spawned (not a leaked orphan from a previous run still
 * squatting the same port) is actually up. See that file's own doc for the full rationale.
 */
process.env.E2E_API_PORT = String(PORT);

/**
 * Published to the environment so `e2e/daemon-ready.ts` gates on the SAME port this config hands
 * the webServer, instead of duplicating the literal. Worker processes are forked from this runner
 * and inherit its env, so the value reaches the specs.
 *
 * The gate is necessary because `webServer.url` below proves only that the APP port answers — the
 * daemon is spawned from inside `app.listen()`'s callback (`src/index.ts:148`), so it is reliably
 * NOT yet listening when Playwright releases the first test. Measured 2026-08-04: first test failed
 * in 1.1s with `ECONNREFUSED 127.0.0.1:4990`, with the daemon confirmed healthy on that port
 * seconds later. See `daemon-ready.ts` for the full trace.
 */
process.env.E2E_AGENT_DAEMON_PORT = String(DAEMON_PORT);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(login|destructive-path)\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `PORT=${PORT} TOVU_CONTENT_DB=${CONTENT_DB_PATH} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
