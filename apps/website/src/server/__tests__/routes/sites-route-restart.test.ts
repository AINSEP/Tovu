import assert from "node:assert/strict";
import test from "node:test";

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
