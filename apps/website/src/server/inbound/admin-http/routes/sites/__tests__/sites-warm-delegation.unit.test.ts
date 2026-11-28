import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import express from "express";
import { requestLoopbackHttp } from "@jini-ai/platform/net";
import { extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "#src/server/runtime/composition/modules/sites";

/**
 * @file A warm dev tab (`TOVU_DEV_WARM_SITES=1` with a control host) hands the whole Sites listing to
 * the original host instead of mounting its own: the local listing, which would read this tab's own
 * site list and supervisor, never runs.
 */

const WARM_KEYS = ["TOVU_DEV_WARM_SITES", "TOVU_DEV_WARM_CONTROL_URL", "TOVU_DEV_WARM_CONTROL_WORKSPACE", "TOVU_DISABLE_DEV_TLS"] as const;

async function listen(t: import("node:test").TestContext, server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://localhost:${(server.address() as { port: number }).port}`;
}

test("in a warm dev tab the Sites listing is answered by the control host and the tab's own listing never runs", async (t) => {
  const seen: string[] = [];
  const host = createServer((req, res) => {
    seen.push(String(req.url));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ sites: [{ name: "host", active: true }, { name: "child", active: false }], currentSite: { name: "host" } }));
  });
  const hostUrl = await listen(t, host);
  const saved = Object.fromEntries(WARM_KEYS.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of WARM_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } });
  Object.assign(process.env, { TOVU_DEV_WARM_SITES: "1", TOVU_DEV_WARM_CONTROL_URL: hostUrl, TOVU_DEV_WARM_CONTROL_WORKSPACE: "host-ws", TOVU_DISABLE_DEV_TLS: "1" });
  const localReads: string[] = [];
  const deps: AdminSitesDeps = {
    createSite: async () => { throw new Error("unexpected site creation"); },
    workspaceId: "child-ws", authorize: async () => ({ allowed: true, reason: "owner" }),
    siteBinding: { name: "child", dir: "/sites/child", dirOverridden: false, switcherCompatible: true },
    isSiteSwitcherEnabled: () => { localReads.push("switcher"); return true; },
    listSites: () => { localReads.push("listSites"); return []; },
    readPersistedActiveSite: () => { localReads.push("persisted"); return "child"; },
  };
  const app = express();
  registerAdminSitesRoutes({ errors: createRouteIncidentReporter().errors, app, deps });
  const childUrl = await listen(t, createServer(app));
  const listing = await requestLoopbackHttp({ url: `${childUrl}/api/admin/v1/workspaces/child-ws/system/sites`, method: "GET", headers: {} });
  assert.deepEqual(seen, ["/api/admin/v1/workspaces/host-ws/system/sites"]);
  assert.equal(JSON.parse(listing.body.toString()).currentSite.name, "child");
  assert.deepEqual(localReads, []);
  // Nothing local sits behind the delegation: the tab mounts no listing or site-action route of its own.
  const root = "/api/admin/v1/workspaces/:workspaceId/system/sites";
  assert.throws(() => extractRouteHandler(app, "get", root), /no GET route registered/);
  assert.throws(() => extractRouteHandler(app, "post", `${root}/:name/trash`), /no POST route registered/);
});
