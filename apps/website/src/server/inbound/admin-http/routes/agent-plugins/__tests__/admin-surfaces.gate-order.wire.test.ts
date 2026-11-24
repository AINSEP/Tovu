import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAgentPluginAdminSurfaceRoutes } from "../admin-surfaces.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * w4-routes K (RT-K1-adm-agent-plugins-2): the exact gate ORDER of the admin-surface writes, through
 * the real registrar on the hand-written route. Both POSTs answer their own cross-origin 403 FIRST,
 * then the session-credential 403, then the workspace 404, then authorization — so a cross-origin
 * request with a machine credential on a foreign workspace still sees `CROSS_ORIGIN_REFUSED`. The GET
 * has neither write gate: the workspace 404 comes first and a machine credential may read.
 * Pinned before any move: the admin mount's `authenticateBeforeWorkspace` + `sessionCredentialOnly`
 * would put the credential and workspace refusals ahead of an origin check made inside the spec.
 */

type Deps = Parameters<typeof registerAgentPluginAdminSurfaceRoutes>[0]["deps"];

async function serve(t: test.TestContext, { credential = "session" }: { credential?: string } = {}) {
  const calls: string[] = [];
  const deps = {
    workspaceId: "ws", clock: { nowMs: () => 0 },
    authorize: async ({ permission }: { permission: string }) => { calls.push(permission); return { allowed: true, reason: "pin" }; },
    adminSurfaceSource: { list: async () => { calls.push("list"); return []; }, readFile: async () => "" },
  } as unknown as Deps;
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = credential; next(); });
  registerAgentPluginAdminSurfaceRoutes({ app, deps });
  const base = await startTestServer(app, t);
  const call = async ({ method = "POST", workspaceId = "ws", tail = "/s1/bootstrap", origin }: { method?: "GET" | "POST"; workspaceId?: string; tail?: string; origin?: string }) => {
    const response = await fetch(`${base}/api/admin/v1/workspaces/${workspaceId}/agent-plugins/p1/surfaces${tail}`, {
      method, headers: { ...(origin === undefined ? {} : { origin }), ...(method === "POST" ? { "content-type": "application/json" } : {}) }, ...(method === "POST" ? { body: "{}" } : {}),
    });
    return { status: response.status, type: response.headers.get("content-type"), body: await response.json() as unknown };
  };
  return { base, calls, call };
}

const json = "application/json; charset=utf-8";
const crossOrigin = { status: 403, type: json, body: { error: "admin surface requests must come from the admin page itself", code: "CROSS_ORIGIN_REFUSED" } };
const sessionOnly = { status: 403, type: json, body: { error: "admin surfaces accept only a signed-in admin session", code: "FORBIDDEN", details: { permission: "admin.plugins.enable", reason: "credential_kind_not_permitted" } } };
const foreign = { status: 404, type: json, body: { error: "workspace was not found" } };

test("admin-surfaces writes: cross-origin, then credential kind, then workspace, then authorization", async (t) => {
  for (const tail of ["/s1/bootstrap", "/s1/actions"]) {
    const machine = await serve(t, { credential: "api_key" });
    assert.deepEqual(await machine.call({ tail, workspaceId: "other", origin: "https://evil.example" }), crossOrigin);
    assert.deepEqual(await machine.call({ tail, workspaceId: "other", origin: machine.base }), sessionOnly);
    const session = await serve(t);
    assert.deepEqual(await session.call({ tail, workspaceId: "other", origin: "https://evil.example" }), crossOrigin);
    assert.deepEqual(await session.call({ tail, workspaceId: "other", origin: session.base }), foreign);
    assert.deepEqual([...machine.calls, ...session.calls], []);
    assert.deepEqual(await session.call({ tail, origin: session.base }), { status: 404, type: json, body: { error: "admin surface was not found", code: "ADMIN_SURFACE_NOT_FOUND" } });
    assert.deepEqual(session.calls, ["admin.plugins.enable", "list"]);
  }
});

test("admin-surfaces list: no write gates; the workspace 404 first, a machine credential may read", async (t) => {
  const machine = await serve(t, { credential: "api_key" });
  assert.deepEqual(await machine.call({ method: "GET", tail: "", workspaceId: "other", origin: "https://evil.example" }), foreign);
  assert.deepEqual(await machine.call({ method: "GET", tail: "", origin: "https://evil.example" }), { status: 200, type: json, body: { pluginId: "p1", surfaces: [] } });
  assert.deepEqual(machine.calls, ["admin.plugins.read", "list"]);
});
