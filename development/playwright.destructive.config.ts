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
 * `TOVU_DB=memory` (never `infra/content.db` — a prior session broke the owner's real admin login
 * by holding that file open across a hung server). Ports: app 4991, daemon 4990 — this dispatch's
 * assigned pair, chosen free of every port already reserved as of 2026-08-04 (4319 real daemon
 * default, 3999 VRT, 4976/4977/4992/4993 BYOK-adjacent, 4998/4999 a2ui, 5173 Vite default).
 *
 * ## A one-time crash, investigated and NOT found to be reproducible — recorded here so it isn't
 * re-discovered from scratch
 *
 * On this suite's FIRST ever run, `login.spec.ts`'s "valid credentials" case hit an uncaught
 * `TypeError: Cannot read properties of null (reading 'useState')` inside React, thrown while
 * mounting the post-login admin shell — captured via a real `page.on("pageerror")` listener, not
 * inferred. Investigation (see `ADS-memory/.local-artifacts/reports/
 * 20260804-e2e-login-and-destructive-path.md` for the full trace) found a real, structurally
 * plausible cause — four `file:`-linked sibling packages (`@jini-ai/admin`, `@jini-ai/chat`,
 * `@jini-ai/ui`, `@jini-ai/renderers-react`) each carry their own nested `node_modules/react`,
 * separate from `apps/admin`'s own, which is the classic setup for a duplicate-React-instance hook
 * crash — but the SAME test then passed cleanly on the next 9 consecutive attempts, including full
 * fresh `webServer` boots identical to the first. That inconsistency means "duplicate React copies"
 * is not confirmed as *the* trigger, only as a real, latent hazard that happened to be live once.
 * Treat any recurrence of this exact error as expected, not surprising, and worth another look at
 * that dependency structure — but this config does not work around it, because it could not be
 * reliably triggered to work around.
 *
 * `workers: 1`, not `fullyParallel`: every spec logs in through the REAL `LOGIN_STRICT` rate
 * limiter (`src/server/middleware/rate-limit.ts`, consulted by `dev-auth.ts`'s login route) — same
 * reasoning `playwright.admin.config.ts` (BYOK) documents for pinning to one worker.
 */
const PORT = 4991;
const DAEMON_PORT = 4990;
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");

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
    command: `PORT=${PORT} TOVU_DB=memory JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
    cwd: REPO_ROOT,
    url: BASE_URL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
