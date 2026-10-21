import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";

import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { parseAdminSurfacesFile, type LoadedAdminSurface } from "@jini-ai/agent-plugins/admin-surfaces";
import type { PluginContributionDefinition } from "@jini-ai/agent-plugins/lifecycle";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { AdminSurfaceHost, AdminSurfaceSource } from "#src/features/agent-plugins/admin-surfaces/surfaces";
import type { AgentPluginsRouteDeps } from "../../deps.js";
import { registerAdminSurfaceFilesRoute } from "#src/server/inbound/public-http/routes/agent-plugin-surfaces/files";
import { registerAgentPluginAdminSurfaceRoutes } from "../../admin-surfaces.js";

/**
 * @file Contract tests for the admin-surface routes beyond the phase-A security pins: the surface
 * listing (shape, plugin filter, workspace check, read permission), the lifecycle-backed default
 * source, the default host (no handlers, null bootstrap data), not-found surfaces, malformed action
 * requests, faults that become a generic 500, and the public files route's lifecycle default and
 * fault handling. Real session stack, typed fakes for the source, host and lifecycle; acme-style ids.
 */

const WORKSPACE = "workspace-local";
const PLUGIN = "acme-office";
const SURFACE = "connection-settings";

const SURFACES_FILE = JSON.stringify({ schemaVersion: 1, surfaces: [
  { id: SURFACE, title: "Manage connection", entry: "surface/index.html", files: ["surface/app.mjs"], linkOrigins: ["https://help.acme.test"],
    actions: [{ name: "save-selection", input: { type: "object", properties: { resourceId: { type: "string", maxLength: 16 } }, required: ["resourceId"] } }], csp: {} },
  { id: "usage", title: "Usage", entry: "usage/index.html", files: [], actions: [], csp: {} },
] });

function loadedSurfaces(pluginId: string): LoadedAdminSurface[] {
  const parsed = parseAdminSurfacesFile({ raw: SURFACES_FILE });
  assert.ok(parsed.ok);
  return parsed.descriptors.map((descriptor) => ({ plugin: { pluginId, packageRoot: `/nonexistent/${pluginId}` }, descriptor }));
}

type Lifecycle = AgentPluginsRouteDeps["agentPluginLifecycle"];

/** A one-package lifecycle that runs the caller's own contribution definition over the file above. */
function fakeLifecycle(reads: string[]): Lifecycle {
  const plugin = { pluginId: PLUGIN, packageRoot: `/nonexistent/${PLUGIN}` };
  return {
    loadPluginContributions: async <D, T>(required: { readonly workspaceId: string; readonly definition: PluginContributionDefinition<D, T> }) => {
      const parsed = required.definition.parse({ raw: SURFACES_FILE });
      assert.ok(parsed.ok);
      const importModule = async (): Promise<never> => { throw new Error("a data contribution imports no module"); };
      const items: T[] = [];
      for (const descriptor of parsed.descriptors) {
        const loaded = await required.definition.load({ plugin, descriptor, importModule });
        // `Awaited<T>` is `T` here (a loaded surface is never a thenable); TS cannot see that for a free T.
        if (typeof loaded !== "string") items.push(loaded as T);
      }
      return { items, refusals: [] };
    },
    readTrustedPluginFile: async (_plugin, filename) => { reads.push(filename); return `/* ${filename} */`; },
  };
}

interface BuildOptions {
  readonly source?: AdminSurfaceSource;
  readonly host?: AdminSurfaceHost;
  readonly parseJson?: boolean;
}

function buildApp(options: BuildOptions = {}) {
  const reads: string[] = [];
  const baseDeps = createRouteDeps();
  // The composition binds a real handler host; these routes must also work without one.
  const { adminSurfaceHost: _siteHost, ...siteDeps } = baseDeps;
  const deps = {
    ...siteDeps, agentPluginLifecycle: fakeLifecycle(reads),
    ...(options.source ? { adminSurfaceSource: options.source } : {}),
    ...(options.host ? { adminSurfaceHost: options.host } : {}),
  };
  const app = express();
  // Sign-in still needs its JSON body; `parseJson: false` leaves only the surface routes unparsed.
  const json = express.json();
  app.use((req, res, next) => (options.parseJson === false && req.path.includes("/surfaces/") ? next() : json(req, res, next)));
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerAgentPluginAdminSurfaceRoutes(app, deps);
  registerAdminSurfaceFilesRoute(app, deps);
  return { app, baseDeps, reads };
}

const listUrl = (baseUrl: string, workspace = WORKSPACE, plugin = PLUGIN) => `${baseUrl}/api/admin/v1/workspaces/${workspace}/agent-plugins/${plugin}/surfaces`;
const surfaceUrl = (baseUrl: string, tail: string, surface = SURFACE) => `${listUrl(baseUrl)}/${surface}/${tail}`;
const post = (url: string, headers: Record<string, string>, body?: unknown) =>
  fetch(url, { method: "POST", headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("list: a plugin's admitted surfaces with their frame src, declared actions and link origins", async (t) => {
  const { app } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await fetch(listUrl(baseUrl), { headers: { cookie } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { pluginId: string; surfaces: Array<Record<string, unknown>> };
  assert.equal(body.pluginId, PLUGIN);
  assert.deepEqual(body.surfaces[0], {
    id: SURFACE, title: "Manage connection", src: `/api/agent-plugin-surfaces/v1/${PLUGIN}/${SURFACE}/surface/index.html`,
    // why: Jini 5791b183 (surface actions are also assistant tools) defaults an undeclared effect to "write".
    actions: [{ name: "save-selection", effect: "write", input: { type: "object", properties: { resourceId: { type: "string", maxLength: 16 } }, required: ["resourceId"] } }],
    linkOrigins: ["https://help.acme.test"],
  });
});

test("list: a surface that declares no link origins lists an empty array", async (t) => {
  const { app } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const body = (await (await fetch(listUrl(baseUrl), { headers: { cookie } })).json()) as { surfaces: Array<{ id: string; linkOrigins: unknown }> };
  assert.deepEqual(body.surfaces.find((surface) => surface.id === "usage")?.linkOrigins, []);
});

test("list: another plugin's surfaces are never listed", async (t) => {
  const source: AdminSurfaceSource = { list: async () => [...loadedSurfaces("other-plugin"), ...loadedSurfaces(PLUGIN)], readFile: async () => "" };
  const { app } = buildApp({ source });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const body = (await (await fetch(listUrl(baseUrl), { headers: { cookie } })).json()) as { surfaces: unknown[] };
  assert.equal(body.surfaces.length, 2);
});

test("list: another workspace in the URL is 404 before any lookup", async (t) => {
  let lists = 0;
  const source: AdminSurfaceSource = { list: async () => { lists += 1; return loadedSurfaces(PLUGIN); }, readFile: async () => "" };
  const { app } = buildApp({ source });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await fetch(listUrl(baseUrl, "other-workspace"), { headers: { cookie } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "workspace was not found" });
  assert.equal(lists, 0);
});

test("list: a principal without admin.plugins.read is 403", async (t) => {
  const { app, baseDeps } = buildApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bare = await loginAsBarePrincipal(baseDeps, baseUrl);
  const response = await fetch(listUrl(baseUrl), { headers: { cookie: bare } });
  assert.equal(response.status, 403);
  assert.equal(((await response.json()) as { details: { permission: string } }).details.permission, "admin.plugins.read");
});

test("list: a source fault is a generic 500 that names no server detail", async (t) => {
  const source: AdminSurfaceSource = { list: async () => { throw new Error("EACCES /srv/site/plugins/acme-office"); }, readFile: async () => "" };
  const { app } = buildApp({ source });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await fetch(listUrl(baseUrl), { headers: { cookie } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("bootstrap: with no host bound, the surface starts with null data", async (t) => {
  const { app } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await post(surfaceUrl(baseUrl, "bootstrap"), { cookie, origin: baseUrl }, {});
  assert.equal(response.status, 200);
  const body = (await response.json()) as { surfaceId: string; data: unknown };
  assert.equal(body.surfaceId, SURFACE);
  assert.equal(body.data, null);
});

test("bootstrap: an unknown surface id is 404 ADMIN_SURFACE_NOT_FOUND and no host code runs", async (t) => {
  let bootstraps = 0;
  const host: AdminSurfaceHost = { handlersFor: () => ({}), bootstrapData: async () => { bootstraps += 1; return null; } };
  const { app } = buildApp({ host });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await post(surfaceUrl(baseUrl, "bootstrap", "missing-surface"), { cookie, origin: baseUrl }, {});
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "admin surface was not found", code: "ADMIN_SURFACE_NOT_FOUND" });
  assert.equal(bootstraps, 0);
});

test("bootstrap: a host fault is a generic 500 that names no server detail", async (t) => {
  const host: AdminSurfaceHost = { handlersFor: () => ({}), bootstrapData: async () => { throw new Error("bootstrap data outside its schema at /token"); } };
  const { app } = buildApp({ host });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await post(surfaceUrl(baseUrl, "bootstrap"), { cookie, origin: baseUrl }, {});
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("actions: with no host bound, a declared action answers action-unavailable", async (t) => {
  const { app } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const body = (await (await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } })).json()) as { ok: boolean; error: { code: string } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "action-unavailable");
});

test("actions: a request that names no action string is 400 INVALID_REQUEST", async (t) => {
  const { app } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  for (const body of [{}, { action: 7, payload: {} }]) {
    const response = await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { error: "the request must name an action", code: "INVALID_REQUEST" });
  }
});

// Pins the guarantee the route relies on instead of a `req.body ?? {}` fallback: the session gate
// parses every body it admits, even when the app mounts no parser of its own.
test("actions: requireAdminSession parses the body itself, so an app without its own parser still answers 400 INVALID_REQUEST", async (t) => {
  const { app } = buildApp({ parseJson: false });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl });
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { code: string }).code, "INVALID_REQUEST");
});

test("actions: an unknown surface id is 404 ADMIN_SURFACE_NOT_FOUND", async (t) => {
  const { app } = buildApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const response = await post(surfaceUrl(baseUrl, "actions", "missing-surface"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } });
  assert.equal(response.status, 404);
  assert.equal(((await response.json()) as { code: string }).code, "ADMIN_SURFACE_NOT_FOUND");
});

test("actions: a handler that throws a non-Error is logged by its type only", async (t) => {
  const host: AdminSurfaceHost = { handlersFor: () => ({ "save-selection": async () => { throw "upstream text"; } }), bootstrapData: async () => null };
  const logged = t.mock.method(console, "error", () => {});
  const { app } = buildApp({ host });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const body = (await (await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } })).json()) as { error: { code: string } };
  assert.equal(body.error.code, "action-failed");
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments), [["[admin-surfaces] action handler failed", { pluginId: PLUGIN, surfaceId: SURFACE, action: "save-selection", error: "string" }]]);
});

test("actions: a handler that throws an Error is logged by its class name, never its message", async (t) => {
  class UpstreamError extends Error { override name = "UpstreamError"; }
  const host: AdminSurfaceHost = { handlersFor: () => ({ "save-selection": async () => { throw new UpstreamError("quota for sheet Payroll"); } }), bootstrapData: async () => null };
  const logged = t.mock.method(console, "error", () => {});
  const { app } = buildApp({ host });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } });
  assert.deepEqual(logged.mock.calls[0]?.arguments[1], { pluginId: PLUGIN, surfaceId: SURFACE, action: "save-selection", error: "UpstreamError" });
});

test("actions: a successful action that issued no sign-in carries no hostSignIns", async (t) => {
  const host: AdminSurfaceHost = {
    handlersFor: () => ({ "save-selection": async () => ({ saved: true }) }), bootstrapData: async () => null,
    signIns: { collect: async ({ run }) => ({ value: await run(), signIns: [] }) },
  };
  const { app } = buildApp({ host });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  assert.deepEqual(await (await post(surfaceUrl(baseUrl, "actions"), { cookie, origin: baseUrl }, { action: "save-selection", payload: { resourceId: "r1" } })).json(), { ok: true, result: { saved: true } });
});

test("surface files: with no test source, files come from the lifecycle's contained read", async (t) => {
  const { app, reads } = buildApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}/api/agent-plugin-surfaces/v1/${PLUGIN}/${SURFACE}/surface/app.mjs`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "/* surface/app.mjs */");
  assert.deepEqual(reads, ["surface/app.mjs"]);
});

test("surface files: a source fault is a plain 404 with nosniff and no-store, never the fault text", async (t) => {
  const source: AdminSurfaceSource = { list: async () => loadedSurfaces(PLUGIN), readFile: async () => { throw new Error("ELOOP /srv/site/plugins/acme-office/surface"); } };
  const { app } = buildApp({ source });
  const { baseUrl } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}/api/agent-plugin-surfaces/v1/${PLUGIN}/${SURFACE}/surface/app.mjs`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "Not found");
});

test("surface files: an empty file path under a known surface is 404 and reads nothing", async (t) => {
  const { app, reads } = buildApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const response = await fetch(`${baseUrl}/api/agent-plugin-surfaces/v1/${PLUGIN}/${SURFACE}/`);
  assert.equal(response.status, 404);
  assert.deepEqual(reads, []);
});

// Pins the guarantee the routes rely on instead of `req.params.x ?? ""` fallbacks: Express never
// matches a route whose named segment is empty, so no handler ever sees a missing param.
test("routing: an empty workspace, plugin or surface segment never reaches a surface handler", async (t) => {
  let lists = 0;
  const source: AdminSurfaceSource = { list: async () => { lists += 1; return loadedSurfaces(PLUGIN); }, readFile: async () => "" };
  const { app } = buildApp({ source });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const admin = `${baseUrl}/api/admin/v1/workspaces`;
  const misses = [
    await fetch(`${admin}//agent-plugins/${PLUGIN}/surfaces`, { headers: { cookie } }),
    await fetch(`${admin}/${WORKSPACE}/agent-plugins//surfaces`, { headers: { cookie } }),
    await post(`${admin}/${WORKSPACE}/agent-plugins/${PLUGIN}/surfaces//bootstrap`, { cookie, origin: baseUrl }, {}),
    await post(`${admin}/${WORKSPACE}/agent-plugins//surfaces/${SURFACE}/actions`, { cookie, origin: baseUrl }, { action: "save-selection" }),
    await fetch(`${baseUrl}/api/agent-plugin-surfaces/v1//${SURFACE}/surface/index.html`),
    await fetch(`${baseUrl}/api/agent-plugin-surfaces/v1/${PLUGIN}//surface/index.html`),
  ];
  for (const response of misses) {
    assert.equal(response.status, 404, response.url);
    assert.match(await response.text(), /Cannot (GET|POST)/, response.url);
  }
  assert.equal(lists, 0);
});
