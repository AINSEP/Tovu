import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAdminSiteUpdateStatusRoute } from "../mount-admin-system.js";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The admin site-update status door through the real registrar: only an allowed session in
 * this workspace reaches the release feed, the reply is never cached, and the update write ports
 * are unreachable from this read.
 */

const PATH = "/system/site-update/status";

function writePortTrap(touched: string[]) {
  return new Proxy({}, { get: (_target, key) => { touched.push(String(key)); throw new Error(`write port ${String(key)} reached`); } });
}

async function serve(t: test.TestContext, { allowed = true, credential = "session" }: { allowed?: boolean; credential?: string } = {}) {
  const reads: string[] = [];
  const touched: string[] = [];
  const asked: unknown[] = [];
  const runtime = {
    runningVersion: async () => { reads.push("running"); return "1.2.0"; },
    feed: { latestRelease: async () => { reads.push("feed"); return { version: "1.3.0", notes: "Faster pages." }; } },
    ids: { next: () => "id" },
    site: writePortTrap(touched), backup: writePortTrap(touched), readiness: writePortTrap(touched), lock: writePortTrap(touched),
  };
  const deps = {
    workspaceId: "ws",
    authorize: async (params: unknown) => { asked.push(params); return { allowed, reason: allowed ? "test" : "denied" }; },
    siteUpdateRuntime: null,
  } as unknown as Pick<RouteDeps, "workspaceId" | "authorize" | "siteUpdateRuntime">;
  const app = express(); app.use(express.json({ strict: false }));
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = credential; next(); });
  registerAdminSiteUpdateStatusRoute({ app, deps });
  // Bound after registration, as the composition assigns it: the route must read it per request.
  deps.siteUpdateRuntime = runtime as unknown as RouteDeps["siteUpdateRuntime"];
  const base = await startTestServer(app, t);
  const call = async (workspaceId: string, method = "GET") => {
    const response = await fetch(`${base}/api/admin/v1/workspaces/${workspaceId}${PATH}`, { method });
    return { status: response.status, cache: response.headers.get("cache-control"), text: await response.text() };
  };
  return { call, reads, touched, asked };
}

test("only an allowed admin session in this workspace can cause a status read", async (t) => {
  const allowed = await serve(t);
  const ok = await allowed.call("ws");
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.text), { availability: { kind: "available", runningVersion: "1.2.0", latest: "1.3.0", notes: "Faster pages." } });
  assert.deepEqual(allowed.reads, ["running", "feed"]);
  assert.ok(allowed.asked.some((params) => (params as { permission?: string }).permission === "system.read"));

  assert.equal((await allowed.call("other")).status, 404);
  const denied = await serve(t, { allowed: false });
  assert.equal((await denied.call("ws")).status, 403);
  const token = await serve(t, { credential: "api_key" });
  const refused = await token.call("ws");
  assert.equal(refused.status, 403);
  assert.match(refused.text, /Sign in to check for site updates\./);
  assert.deepEqual([...denied.reads, ...token.reads], []);
  assert.equal(allowed.reads.length, 2, "the foreign workspace caused no read");
});

test("the status route is GET only no-store and never reaches update write ports", async (t) => {
  const served = await serve(t);
  const ok = await served.call("ws");
  assert.equal(ok.status, 200);
  assert.equal(ok.cache, "no-store");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal((await served.call("ws", method)).status, 404, method);
  assert.deepEqual(served.reads, ["running", "feed"]);
  assert.deepEqual(served.touched, []);
});
