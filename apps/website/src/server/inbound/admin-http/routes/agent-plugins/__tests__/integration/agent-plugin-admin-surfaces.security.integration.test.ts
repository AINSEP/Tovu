import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";

import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { parseAdminSurfacesFile, type AdminSurfaceActionHandler, type LoadedAdminSurface } from "@jini-ai/agent-plugins/admin-surfaces";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { AdminSurfaceHost, AdminSurfaceRequestContext, AdminSurfaceSource } from "#src/features/agent-plugins/admin-surfaces/surfaces";
import { registerAdminSurfaceFilesRoute } from "#src/server/inbound/public-http/routes/agent-plugin-surfaces/files";
import { registerAgentPluginAdminSurfaceRoutes } from "../../admin-surfaces.js";

/**
 * @file Security pins for the admin-surface mount (phase A): the public files route serves only
 * declared files with Jini's isolation headers; the bootstrap is never cached; both POSTs refuse
 * cross-origin requests, missing sessions and missing permissions BEFORE any host code runs; a
 * handler's own error text never reaches the response or the log. Real session stack
 * (`requireAdminSession`), typed fakes for the surface source and the host port; acme-style ids.
 */

const WORKSPACE = "workspace-local";
const PLUGIN = "acme-office";
const SURFACE = "connection-settings";
const SECRET = "sk" + "-" + "x".repeat(24);

function fakeSurface(): LoadedAdminSurface {
  const parsed = parseAdminSurfacesFile({ raw: JSON.stringify({ schemaVersion: 1, surfaces: [{
    id: SURFACE, title: "Manage connection", entry: "surface/index.html", files: ["surface/app.mjs"],
    actions: [{ name: "save-selection", input: { type: "object", properties: { resourceId: { type: "string", maxLength: 16 } }, required: ["resourceId"] } }],
    csp: {},
  }] }) });
  assert.ok(parsed.ok);
  return { plugin: { pluginId: PLUGIN, packageRoot: "/nonexistent/acme-office" }, descriptor: parsed.descriptors[0]! };
}

interface Harness {
  readonly reads: string[];
  readonly bootstraps: AdminSurfaceRequestContext[];
  readonly calls: Array<{ payload: unknown; context: AdminSurfaceRequestContext }>;
}

function buildApp(options: { readonly handler?: AdminSurfaceActionHandler<AdminSurfaceRequestContext> } = {}) {
  const harness: Harness = { reads: [], bootstraps: [], calls: [] };
  const source: AdminSurfaceSource = {
    list: async () => [fakeSurface()],
    readFile: async ({ filename }) => { harness.reads.push(filename); return `/* ${filename} */`; },
  };
  const handler: AdminSurfaceActionHandler<AdminSurfaceRequestContext> = options.handler ?? (async ({ payload, context }) => { harness.calls.push({ payload, context }); return { saved: true }; });
  const host: AdminSurfaceHost = {
    handlersFor: () => ({ "save-selection": handler }),
    bootstrapData: async ({ context }) => { harness.bootstraps.push(context); return { publicConfig: "x" }; },
  };
  const baseDeps = createRouteDeps();
  const deps = { ...baseDeps, adminSurfaceSource: source, adminSurfaceHost: host };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  // Simulates what `requireAdminSession` records for an API-key credential (the owner's grants, a
  // machine credential kind), without minting a key through the api-keys module.
  app.use("/api/admin", (req, res, next) => { if (req.get("x-test-credential-kind") === "api_key") res.locals.authCredentialKind = "api_key"; next(); });
  registerAgentPluginAdminSurfaceRoutes(app, deps);
  registerAdminSurfaceFilesRoute(app, deps);
  return { app, harness, baseDeps };
}

const surfaceUrl = (baseUrl: string, tail: string) => `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/agent-plugins/${PLUGIN}/surfaces/${SURFACE}/${tail}`;
const post = (url: string, headers: Record<string, string>, body: unknown = {}) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("surface files: the entry is served without a session, with the sandbox CSP and nosniff", async (t) => {
  const { app } = buildApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}/api/agent-plugin-surfaces/v1/${PLUGIN}/${SURFACE}/surface/index.html`);
  assert.equal(response.status, 200);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /^default-src 'none';/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /sandbox allow-scripts$/);
  assert.doesNotMatch(csp, /allow-same-origin|unsafe-/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("surface files: undeclared, traversal and unknown-surface paths are 404 and read nothing", async (t) => {
  const { app, harness } = buildApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  for (const tail of [`${PLUGIN}/${SURFACE}/plugin.json`, `${PLUGIN}/${SURFACE}/surface/..%2F..%2Fplugin.json`, `${PLUGIN}/${SURFACE}/surface%2Fapp.mjs%00`, `${PLUGIN}/other-surface/surface/index.html`, `other-plugin/${SURFACE}/surface/index.html`]) {
    const response = await fetch(`${baseUrl}/api/agent-plugin-surfaces/v1/${tail}`);
    assert.equal(response.status, 404, tail);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", tail);
  }
  assert.deepEqual(harness.reads, []);
});

test("bootstrap: a same-origin admin session gets the envelope with Cache-Control: no-store", async (t) => {
  const { app, harness } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await post(surfaceUrl(baseUrl, "bootstrap"), { cookie, origin: baseUrl });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  const body = (await response.json()) as { surfaceId: string; issuedAt: number; expiresAt: number; data: unknown };
  assert.equal(body.surfaceId, SURFACE);
  assert.deepEqual(body.data, { publicConfig: "x" });
  assert.ok(body.expiresAt - body.issuedAt <= 300_000);
  assert.equal(harness.bootstraps[0]?.pluginId, PLUGIN);
});

test("bootstrap + actions: missing, foreign, opaque and cross-site origins are refused before host code runs", async (t) => {
  const { app, harness } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const cases: Array<Record<string, string>> = [
    { cookie },
    { cookie, origin: "https://evil.example" },
    { cookie, origin: "null" },
    { cookie, origin: baseUrl, "sec-fetch-site": "cross-site" },
  ];
  for (const headers of cases) {
    for (const tail of ["bootstrap", "actions"]) {
      const response = await post(surfaceUrl(baseUrl, tail), headers, { action: "save-selection", payload: { resourceId: "r1" } });
      assert.equal(response.status, 403, `${tail} ${JSON.stringify({ ...headers, cookie: undefined })}`);
      assert.equal(((await response.json()) as { code: string }).code, "CROSS_ORIGIN_REFUSED");
    }
  }
  assert.equal(harness.bootstraps.length, 0);
  assert.equal(harness.calls.length, 0);
});

test("bootstrap + actions: no session is 401 and a principal without admin.plugins.enable is 403", async (t) => {
  const { app, harness, baseDeps } = buildApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bare = await loginAsBarePrincipal(baseDeps, baseUrl);
  for (const tail of ["bootstrap", "actions"]) {
    assert.equal((await post(surfaceUrl(baseUrl, tail), { origin: baseUrl })).status, 401, tail);
    const forbidden = await post(surfaceUrl(baseUrl, tail), { cookie: bare, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } });
    assert.equal(forbidden.status, 403, tail);
    const body = (await forbidden.json()) as { code: string; details: { permission: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.equal(body.details.permission, "admin.plugins.enable");
  }
  assert.equal(harness.bootstraps.length, 0);
  assert.equal(harness.calls.length, 0);
});

test("actions: a declared action runs with the session principal; undeclared and off-schema requests never reach it", async (t) => {
  const { app, harness } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const ok = await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(await ok.json(), { ok: true, result: { saved: true } });
  assert.deepEqual(harness.calls.map(({ payload, context }) => ({ payload, pluginId: context.pluginId, surfaceId: context.surfaceId, workspaceId: context.workspaceId, principal: typeof context.principalId })), [
    { payload: { resourceId: "r1" }, pluginId: PLUGIN, surfaceId: SURFACE, workspaceId: WORKSPACE, principal: "string" },
  ]);
  const undeclared = (await (await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "delete-everything", payload: {} })).json()) as { ok: boolean; error: { code: string } };
  assert.equal(undeclared.error.code, "action-undeclared");
  const offSchema = (await (await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r".repeat(17) } })).json()) as { ok: boolean; error: { code: string } };
  assert.equal(offSchema.error.code, "invalid-payload");
  assert.equal(harness.calls.length, 1);
});

test("actions: a handler's error text never reaches the response or the server log", async (t) => {
  const { app } = buildApp({ handler: async () => { throw new Error(`upstream said ${SECRET}`); } });
  const logged = t.mock.method(console, "error", () => {});
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal((JSON.parse(text) as { error: { code: string } }).error.code, "action-failed");
  assert.doesNotMatch(text, new RegExp(SECRET));
  assert.ok(logged.mock.calls.length >= 1);
  assert.doesNotMatch(JSON.stringify(logged.mock.calls.map((call) => call.arguments)), new RegExp(SECRET));
});

test("bootstrap + actions: a machine (API-key) credential is refused even with the owner's grants", async (t) => {
  const { app, harness } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  for (const tail of ["bootstrap", "actions"]) {
    const response = await post(surfaceUrl(baseUrl, tail), { cookie, origin: baseUrl, "x-test-credential-kind": "api_key" }, { action: "save-selection", payload: { resourceId: "r1" } });
    assert.equal(response.status, 403, tail);
    assert.equal(((await response.json()) as { details: { reason: string } }).details.reason, "credential_kind_not_permitted");
  }
  assert.equal(harness.bootstraps.length, 0);
  assert.equal(harness.calls.length, 0);
});
