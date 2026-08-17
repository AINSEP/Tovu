import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * @file Live end-to-end publish config — the FIRST fully automated, click-through proof that a real
 * publish to GitHub Pages can succeed through the assistant (dispatch: "Live publish end-to-end
 * test", 2026-08-16). Everything up to this point (`ADS-memory/reports/verification/
 * 2026-08-16-live-publish-through-assistant.md`) drove the ALREADY-RUNNING dev server directly and
 * stopped short of clicking Publish. This config gives that same real flow its own isolated,
 * rerunnable, committed home.
 *
 * ## Why this seeds from a REAL backup of `infra/content.db`, not a fresh empty DB
 *
 * Every sibling config in this directory (`playwright.destructive.config.ts`,
 * `playwright.deployment-static-site-verify-gap.config.ts`) boots against an EMPTY DB — correct for
 * them, because their fixtures are synthetic and self-contained. This suite cannot do that: the one
 * thing under test is a real publish using a real, already-saved GitHub Pages token belonging to
 * `leonaburime-ucla`, and that token exists in exactly one place — the live `infra/content.db` — with
 * no server-env-var fallback configured (checked: `static-publish/credentials.ts` reads no
 * `process.env.*` token for github-pages). There is no way to seed a fresh DB with a working credential
 * without the raw PAT, which this agent does not have and should not have.
 *
 * So this takes a CONSISTENT SNAPSHOT of the live file via SQLite's own Online Backup API
 * (`sqlite3 infra/content.db ".backup '<tmp>'"`, not a raw `cp` — `.backup` is safe against a
 * concurrent writer and correctly captures WAL-mode state; a bare `cp` is not) into a fresh
 * `os.tmpdir()` path, once per config load. The running dev server's own `infra/content.db` is never
 * opened by this config — this sidesteps the exact hazard `playwright.destructive.config.ts`'s own
 * header warns about ("never `infra/content.db` — a prior session broke the owner's real admin login
 * by holding that file open across a hung server"). From that point on this suite's server is a fully
 * independent process against an independent file; the ONLY thing shared with the outside world is the
 * real GitHub account the credential in that snapshot points to.
 *
 * A direct consequence: the credential's `accountLabel` column is whatever it is in the live DB AT
 * SNAPSHOT TIME — as of writing, `null` (migration 0044 shipped after the last real verify call, and
 * `StaticSiteTab.tsx` still has no Verify control — a separate, already-tracked gap,
 * `deployment-static-site-verify-gap.spec.ts`). The spec heals this itself via the same human-gated
 * `POST .../credentials/:id/verify` route the admin's own (missing) Verify button would call — see the
 * spec's own setup step for why that is a legitimate stand-in for a click, not a workaround.
 *
 * ## Topology
 *
 * Two-process boot, mirroring `playwright.deployment-static-site-verify-gap.config.ts`'s own pattern
 * exactly (not `playwright.destructive.config.ts`'s single combined process): a dedicated API/daemon
 * process (`TOVU_CONTENT_DB=<snapshot>`, spawns the agent daemon internally per `src/index.ts:148`)
 * PLUS a separate `apps/admin` Vite dev server proxying `/api` to it. The separate Vite process matters
 * here specifically: `apps/admin/dist/` is a stale, pre-2026-08-13 build (confirmed live,
 * `live-publish-driver.mjs`'s own header) and this session's own git log shows admin UI commits landing
 * today — driving the API server's static bundle would silently test yesterday's UI.
 *
 * Ports 7951 (API)/7952 (admin Vite)/7953 (daemon) — assigned by the dispatching coordinator as free of
 * every other config's own reservation as of 2026-08-16 (nearest neighbors: 7941-3
 * `deployment-static-site-verify-gap`); a second agent is running tests concurrently in this same tree,
 * so these are NOT to be reused or reassigned.
 *
 * `workers: 1`: one real publish at a time, same reasoning every login-driving config in this directory
 * already gives (the real `LOGIN_STRICT` rate limiter), plus this suite's own additional reason — two
 * concurrent real pushes to the SAME `leonaburime-ucla/tovu-demo` repo would race each other's git
 * history for no diagnostic value.
 */
const API_PORT = 7951;
const ADMIN_PORT = 7952;
const DAEMON_PORT = 7953;
const BASE_URL = `http://localhost:${ADMIN_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.resolve(REPO_ROOT, "apps/admin");

const LIVE_CONTENT_DB = path.join(REPO_ROOT, "infra", "content.db");
const CONTENT_DB_SNAPSHOT = path.join(os.tmpdir(), `tovu-e2e-live-publish-content-${Date.now()}-${process.pid}.db`);

if (!fs.existsSync(LIVE_CONTENT_DB)) {
  throw new Error(
    `live-publish-e2e config expects the real dev DB at ${LIVE_CONTENT_DB} (source of the already-saved ` +
      `GitHub Pages credential) — it does not exist. This suite cannot seed a working credential any ` +
      `other way; see this file's header.`
  );
}

// `.backup`, not `cp`: safe under a concurrent writer (the live dev server may currently have this file
// open) and correct under WAL mode, per SQLite's own Online Backup API. Runs once, synchronously, at
// config load — before any webServer starts.
execFileSync("sqlite3", [LIVE_CONTENT_DB, `.backup '${CONTENT_DB_SNAPSHOT}'`]);

/**
 * Loads `.env` into THIS process (config authoring process) so it is inherited by the webServer child
 * below — the exact same mechanism `development/scripts/dev.mjs` (the real `npm run dev` entry point)
 * uses, and for the same reason: `src/index.ts` deliberately never auto-loads `.env` itself (that
 * file's own header: a `.env` silently overriding real env vars on a production boot would be a much
 * worse thing than requiring an explicit load in dev). Every other config in this directory boots
 * `src/index.ts` the same raw way and never needed this, because none of them decrypt a real secret —
 * `AesGcmSecretSealer` needs `TOVU_INTEGRATIONS_ROOT_KEY` to decrypt the real GitHub token this suite
 * verifies, and its `allowFileFallback: false` posture in this install means a missing key is a hard,
 * uncaught throw (measured: crashed the whole webServer process, not a clean 4xx) rather than a
 * graceful degrade. `process.loadEnvFile` is Node's own (v20.12+, no dependency) — same call
 * `dev.mjs` makes.
 */
const ENV_FILE = path.join(REPO_ROOT, ".env");
if (fs.existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

/** Published for the spec's own diagnostics — if the credential turns out missing/broken in the
 *  snapshot, the failure message can name exactly which file was used, not just "the DB". */
process.env.E2E_LIVE_PUBLISH_CONTENT_DB = CONTENT_DB_SNAPSHOT;
process.env.E2E_API_PORT = String(API_PORT);
process.env.E2E_AGENT_DAEMON_PORT = String(DAEMON_PORT);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /live-publish-e2e\.spec\.ts/,
  timeout: 600_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0, // a real publish is not idempotent-safe to blindly retry — see the spec's own header.
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
  webServer: [
    {
      command: `PORT=${API_PORT} TOVU_CONTENT_DB=${CONTENT_DB_SNAPSHOT} JINI_AGENT_DAEMON_PORT=${DAEMON_PORT} node --import tsx src/index.ts`,
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
