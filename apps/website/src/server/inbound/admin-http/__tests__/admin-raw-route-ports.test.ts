import assert from "node:assert/strict";
import test from "node:test";
import { defineJsonRoute, ok, routeReply, type RouteInputContext } from "@jini-ai/core/contracts/server";
import { defineRawRoute } from "@jini-ai/http-kit";

import { mountAdminJsonRoute, mountPublicJsonRoute } from "../admin-json-route-ports.js";
import { mountAdminRawRoute, mountPublicRawRoute } from "../admin-raw-route-ports.js";
import { fakeAdminApp, listen } from "./fixtures/port-harness.js";

/**
 * w3-rtfnd T1/T2/T6: raw (non-JSON) specs mount behind the same admin/visitor ports as JSON specs;
 * every Tovu mount binds the request-facts resolver; a public mount may opt into the workspace 404;
 * spec opt-ins (`readHeaders`, `responseHeaders`) and `routeReply` pass through the Tovu mounts.
 */
type Deps = { workspaceId: string; authorize: (input: unknown) => Promise<{ allowed: boolean; reason: string }> };
const adminPath = "/api/admin/v1/workspaces/:workspaceId/raw";
const visitor = { operation: "probe:public-raw", visitorError: "The site couldn’t load the probe." };

function rawSpec(mode: { crash?: boolean } = {}) {
  return defineRawRoute<Deps, { id: string }>({
    method: "get", path: adminPath,
    handle: async ({ authorize }) => {
      await authorize?.({ permission: "probe.read" });
      if (mode.crash) throw new Error("secret /var/db/site.sqlite");
      const headers = new Headers({ "content-type": "text/html; charset=utf-8", location: "/admin" });
      headers.append("set-cookie", "a=1; Path=/");
      headers.append("set-cookie", "b=2; Path=/");
      return new Response("<p>moved</p>", { status: 302, headers });
    },
  });
}

async function adminServer({ allowed = true, crash = false, sessionOnly = false } = {}) {
  const app = fakeAdminApp();
  const deps: Deps = { workspaceId: "local", authorize: async () => ({ allowed, reason: "no_grant" }) };
  mountAdminRawRoute({ app, spec: rawSpec({ crash }), deps }, sessionOnly ? { sessionCredentialOnly: { message: "Sessions only.", permission: "probe.read" } } : {});
  const server = await listen({ app });
  const get = (workspace = "local", headers: Record<string, string> = {}) => fetch(`${server.base}/api/admin/v1/workspaces/${workspace}/raw`, { redirect: "manual", headers });
  return { ...server, get };
}

test("an admin raw spec writes its web Response: status, every Set-Cookie, body", async (t) => {
  const s = await adminServer();
  t.after(s.close);
  const response = await s.get();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/admin");
  assert.deepEqual(response.headers.getSetCookie(), ["a=1; Path=/", "b=2; Path=/"]);
  assert.equal(await response.text(), "<p>moved</p>");
});

test("an admin raw spec answers the admin ports' 404, credential 403, RBAC 403 and redacted 500", async (t) => {
  const s = await adminServer();
  t.after(s.close);
  const foreign = await s.get("other");
  assert.deepEqual({ status: foreign.status, body: await foreign.json() }, { status: 404, body: { error: "workspace was not found" } });
  const gated = await adminServer({ sessionOnly: true });
  t.after(gated.close);
  const key = await gated.get("local", { "x-kind": "api_key" });
  assert.deepEqual({ status: key.status, body: await key.json() }, { status: 403, body: { error: "Sessions only.", code: "FORBIDDEN", details: { permission: "probe.read", reason: "credential_kind_not_permitted" } } });
  const denied = await adminServer({ allowed: false });
  t.after(denied.close);
  const refusal = await denied.get();
  assert.deepEqual({ status: refusal.status, body: await refusal.json() }, { status: 403, body: { error: "principal 'caller' is not authorized for 'probe.read' (no_grant)", code: "FORBIDDEN", details: { permission: "probe.read", reason: "no_grant" } } });
  const crashed = await adminServer({ crash: true });
  t.after(crashed.close);
  const failure = await crashed.get();
  const body = await failure.json() as { code: string };
  assert.equal(failure.status, 500);
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /site\.sqlite/);
});

test("every Tovu mount binds the request facts; header opt-ins and routeReply pass through", async (t) => {
  const app = fakeAdminApp();
  const deps: Deps = { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) };
  const echo = (raw: RouteInputContext) => ok({ value: routeReply({ status: 429, body: { facts: raw.facts, headers: raw.headers }, headers: { "Retry-After": "7" } }) });
  const factsSpec = <Context,>(path: string) => ({ ...defineJsonRoute<RouteInputContext, unknown, Deps, Context>({ method: "get", path, parse: (raw) => ok({ value: raw }), handle: async ({ input }) => echo(input) }), requestFacts: true as const, readHeaders: ["x-probe"] });
  mountAdminJsonRoute({ app, spec: factsSpec<{ id: string }>("/api/admin/v1/workspaces/:workspaceId/facts"), deps });
  mountPublicJsonRoute({ app, spec: factsSpec<undefined>("/public/facts"), deps, failure: visitor });
  const server = await listen({ app });
  t.after(server.close);
  const host = new URL(server.base).host;
  for (const path of ["/api/admin/v1/workspaces/local/facts", "/public/facts"]) {
    const response = await fetch(`${server.base}${path}`, { headers: { "user-agent": "probe-agent/1", "x-probe": "yes", "x-other": "no" } });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "7");
    const { facts, headers } = await response.json() as { facts: Record<string, string>; headers: Record<string, string> };
    assert.match(facts.clientAddress, /127\.0\.0\.1/);
    assert.deepEqual({ userAgent: facts.userAgent, host: facts.host }, { userAgent: "probe-agent/1", host });
    assert.deepEqual(headers, { "x-probe": "yes" });
  }
});

test("a public mount answers the workspace 404 only when given a workspaceId, with its static headers", async (t) => {
  const app = fakeAdminApp({ principal: false });
  const spec = { ...defineJsonRoute<void, { ok: true }, object>({ method: "get", path: "/api/p/:workspaceId/probe", parse: () => ok({ value: undefined }), handle: async () => ok({ value: { ok: true as const } }) }), responseHeaders: { "Cache-Control": "no-store" } };
  mountPublicJsonRoute({ app, spec, deps: {}, failure: visitor, workspaceId: "local" });
  mountPublicJsonRoute({ app, spec: { ...spec, path: "/api/q/:workspaceId/probe" }, deps: {}, failure: visitor });
  const server = await listen({ app });
  t.after(server.close);
  const foreign = await fetch(`${server.base}/api/p/other/probe`);
  assert.equal(foreign.headers.get("cache-control"), "no-store");
  assert.deepEqual({ status: foreign.status, body: await foreign.json() }, { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(await server.call("/api/p/local/probe"), { status: 200, body: { ok: true } });
  assert.deepEqual(await server.call("/api/q/other/probe"), { status: 200, body: { ok: true } });
});

test("a public raw spec writes its bytes, and an unexpected failure is the visitor-safe 500", async (t) => {
  const app = fakeAdminApp({ principal: false });
  const xml = defineRawRoute<object>({ method: "get", path: "/sitemap.xml", handle: async () => new Response("<urlset/>", { headers: { "content-type": "application/xml" } }) });
  const broken = defineRawRoute<object>({ method: "get", path: "/broken.xml", handle: async () => { throw new Error("private"); } });
  mountPublicRawRoute({ app, spec: xml, deps: {}, failure: visitor });
  mountPublicRawRoute({ app, spec: broken, deps: {}, failure: visitor });
  const server = await listen({ app });
  t.after(server.close);
  const ok200 = await fetch(`${server.base}/sitemap.xml`);
  assert.deepEqual({ status: ok200.status, type: ok200.headers.get("content-type"), body: await ok200.text() }, { status: 200, type: "application/xml", body: "<urlset/>" });
  const failed = await fetch(`${server.base}/broken.xml`);
  const body = await failed.json() as Record<string, string>;
  assert.equal(failed.status, 500);
  assert.equal(body.error, visitor.visitorError);
  assert.deepEqual(Object.keys(body).sort(), ["error", "errorId"]);
});
