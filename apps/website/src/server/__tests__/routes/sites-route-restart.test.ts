import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { AdminSitesDeps } from "../../inbound/admin-http/routes/system/sites.js";
import { SITE_SWITCH_RESTART_INSTRUCTIONS, SITE_SWITCH_RESTARTING_NOTICE } from "#src/features/sites/index";

/**
 * @file Activate's optional `restartNow` (2026-10-05, OD-S1): with it, the route asks the
 * `npm run dev` supervisor (a fake `devRestart` here) to restart onto the new site; without it,
 * Activate answers exactly as before — no `restarting` field, no restart.
 */

type SitesTestDeps = ReturnType<typeof createRouteDeps> & AdminSitesDeps;

const SITE = { name: "alpha", dir: "/repo/sites/alpha", displayName: "Alpha", createdAt: "2026-10-05T00:00:00.000Z", active: false };

function setup() {
  const requests: Array<{ reason: string }> = [];
  const deps: SitesTestDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    siteBinding: { dir: "/repo/sites/served", name: "served", dirOverridden: false, switcherCompatible: true },
    listSites: () => [SITE],
    readSiteRunning: () => null,
    persistActiveSite: () => {},
    devRestart: { requestRestart: (required) => void requests.push(required) },
  };
  return { deps, requests };
}

async function activate(deps: SitesTestDeps, t: Parameters<typeof bootAuthenticated>[1], body: unknown) {
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites/alpha/activate`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("Activate without restartNow is unchanged: persist + instructions, no restart requested", async (t) => {
  const env = setup();
  const res = await activate(env.deps, t, {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS });
  assert.deepEqual(env.requests, []);
});

test("Activate with restartNow asks the dev supervisor to restart", async (t) => {
  const env = setup();
  const res = await activate(env.deps, t, { restartNow: true });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTARTING_NOTICE, restarting: true });
  assert.deepEqual(env.requests, [{ reason: "switch site to 'alpha'" }]);
});

test("Activate refuses a live Desktop target with 409 and its URL before saving or restarting", async (t) => {
  const env = setup();
  env.deps.readSiteRunning = ({ dir }) => {
    assert.equal(dir, SITE.dir);
    return { pid: 42, port: 53775, app: "Desktop", scheme: "http", started: "2026-10-26T00:00:00Z", token: ["test", "lease"].join("-") };
  };
  env.deps.persistActiveSite = () => assert.fail("occupied target must not persist");
  const res = await activate(env.deps, t, { restartNow: true });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { code: "SITE_ALREADY_RUNNING", url: "http://localhost:53775/admin/",
    error: "Site 'alpha' is open in the Desktop app at http://localhost:53775/admin/ — close it there or open it in Desktop. Switch refused; the current site is still running." });
  assert.deepEqual(env.requests, []);
});

test("the admin default remains switchable and writes its restart request without the chat delay", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "tovu-admin-restart-"));
  const requestFile = path.join(directory, "request.json");
  const previousRequestFile = process.env.TOVU_DEV_RESTART_REQUEST_FILE;
  const previousPinned = process.env.TOVU_DEV_SITE_PINNED;
  t.after(() => {
    if (previousRequestFile === undefined) delete process.env.TOVU_DEV_RESTART_REQUEST_FILE;
    else process.env.TOVU_DEV_RESTART_REQUEST_FILE = previousRequestFile;
    if (previousPinned === undefined) delete process.env.TOVU_DEV_SITE_PINNED;
    else process.env.TOVU_DEV_SITE_PINNED = previousPinned;
    rmSync(directory, { recursive: true, force: true });
  });
  process.env.TOVU_DEV_RESTART_REQUEST_FILE = requestFile;
  delete process.env.TOVU_DEV_SITE_PINNED;
  const { deps } = setup();
  delete deps.devRestart;
  deps.readPersistedActiveSite = () => null;
  deps.sitePreviews = null;
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`;
  const snapshot = await fetch(url, { headers: { cookie } });
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json()).canSwitchNow, true);
  const response = await fetch(`${url}/alpha/activate`, {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ restartNow: true }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).restarting, true);
  // Allow event-loop jitter, but never the chat port's deliberate 3000 ms grace period.
  const deadline = Date.now() + 750;
  while (!existsSync(requestFile) && Date.now() < deadline) await delay(10);
  assert.equal(existsSync(requestFile), true, "admin restart request should be written promptly");
  assert.equal(JSON.parse(readFileSync(requestFile, "utf8")).reason, "switch site to 'alpha'");
});
