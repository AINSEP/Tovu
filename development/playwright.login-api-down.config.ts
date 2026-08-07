import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Reproduction for the reported symptom "the repo owner cannot log in to the admin UI"
 * (QA/E2E dispatch, 2026-08-06 — Debug-AdminLogin).
 *
 * ## What this proves, and what it does NOT prove
 *
 * Live investigation (curl + real headless Chromium) found that login itself works correctly the
 * instant a real API server is reachable, in both boot shapes tried (`npm run dev`, and a
 * standalone `tsx watch src/index.ts` serving the possibly-stale `apps/admin/dist` build directly
 * at `:3000/admin/`). The one and only failure this investigation could reproduce is: **no process
 * listening where the admin app expects the API** — confirmed live at investigation start (`curl
 * http://localhost:3000/api/health` failed to connect) alongside two long-orphaned Vite dev
 * servers (one ~1 day old, one from earlier the same day, both predating the ~35-commit refactor
 * round) still bound to `:5173`/`:5174`.
 *
 * This config reproduces that exact shape deterministically: it boots ONLY the admin Vite dev
 * server (matching `apps/admin/package.json`'s own `dev` script) with its `/api` proxy target
 * pointed at a port nothing listens on (`TOVU_API_URL`, see `apps/admin/vite.config.ts:70`),
 * instead of relying on timing to kill or never-start a real API process. No `webServer` entry
 * boots `src/index.ts` here — that absence IS the fixture.
 *
 * `login.spec.ts` (`playwright.destructive.config.ts`) already covers "login works when the API is
 * up" exhaustively (valid/invalid credentials, cookie flags, reload, logout). This config covers
 * the complementary, previously-untested case, and captures the actual root cause of operator
 * confusion found live: Vite's dev proxy answers an unreachable upstream with a bare `500`, and
 * `apps/admin/src/lib/api.ts`'s `request()` has no non-JSON-body fallback message beyond the
 * generic `` `request failed (${res.status})` ``  (api.ts:819) — so the login screen shows
 * **"request failed (500)"**, a string that reads as "the server crashed" to anyone debugging it,
 * not "no server is running." That mismatch is a plausible reason "start the server" did not
 * immediately resolve the report: the on-screen error actively points away from the true cause.
 *
 * Modeled on `playwright.destructive.config.ts`'s own header for the two load-bearing details it
 * documents: `testDir`/`testMatch` scoped narrowly (this directory is shared with a dozen other
 * suites), and `webServer.cwd` set explicitly rather than left to default (the config file's own
 * directory is `development/`, not the repo root or `apps/admin`).
 */
const PORT = 5972;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_ROOT = path.resolve(__dirname, "../apps/admin");
// Deliberately unreachable: nothing binds this port anywhere in this repo's dev tooling (compare
// the reserved-port list in `playwright.destructive.config.ts`'s own header). Vite's proxy target
// needs SOME address to fail to connect to; a real never-used port makes the failure deterministic
// instead of racing a real server's boot/teardown timing.
const DEAD_API_PORT = 5973;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /login-api-down\.spec\.ts/,
  timeout: 30_000,
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
    command: `npx vite --port ${PORT}`,
    cwd: ADMIN_ROOT,
    // `base: "/admin/"` (apps/admin/vite.config.ts:39) means bare `BASE_URL` is a 301, not the app
    // itself — poll the real mount path so Playwright doesn't release the first test against a
    // server that answered but isn't actually ready to serve the SPA yet.
    url: `${BASE_URL}/admin/`,
    timeout: 30_000,
    reuseExistingServer: false,
    env: { TOVU_API_URL: `http://localhost:${DEAD_API_PORT}` },
  },
});
