import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import express from "express";
import { createPluginSourcePolicy, type PluginActivationRecord, type PluginConflict } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord, PluginInstallerPort } from "@jini-ai/plugins/host/node";
import { registerPluginsListRoute, type PluginsListRouteDeps } from "../../list.js";

// Route-level tests for PLUGINS_LIST: every guard, the per-row projection inputs and the
// installSources switch. The real discovery/auth stack is pinned by
// `__tests__/integration/plugins-http.integration.test.ts`.
const WS = "ws-1";
const RECORDS: readonly PluginDiscoveryRecord[] = [
  { id: "alpha", name: "Alpha", version: "1.0.0", source: "site", tier: "tier-2", status: "valid", errors: [] },
  { id: "beta", name: "Beta", version: "2.0.0", source: "built-in", tier: "tier-3", status: "valid", errors: [] },
];
const ALPHA_ON: PluginActivationRecord = { pluginId: "alpha", workspaceId: WS, version: "1.0.0", enabled: true, updatedAt: "2026-10-01T00:00:00.000Z" };
const CONFLICT: PluginConflict = { kind: "route", key: "/x", heldBy: "beta", heldByName: "Beta", heldKey: "/x" };
const INSTALLER: PluginInstallerPort = {
  preview: async () => { throw new Error("the list route must never preview"); },
  install: async () => { throw new Error("the list route must never install"); },
};
type Authorization = Parameters<PluginsListRouteDeps["authorize"]>[0];
type Lookup = Parameters<PluginsListRouteDeps["pluginActivationRepo"]["getActivation"]>[0];
type BootOptions = {
  allowed?: boolean;
  principal?: "none";
  discover?: () => Promise<readonly PluginDiscoveryRecord[]>;
  conflicts?: "none" | ReadonlyMap<string, readonly PluginConflict[]>;
  policy?: "none" | boolean;
  installer?: "none";
};

async function boot(t: TestContext, options: BootOptions = {}) {
  const authorizations: Authorization[] = [];
  const lookups: Lookup[] = [];
  let discoveries = 0;
  const conflicts = options.conflicts ?? new Map([["alpha", [CONFLICT]]]);
  const deps: PluginsListRouteDeps = {
    workspaceId: WS,
    authorize: async (request) => { authorizations.push(request); return options.allowed === false ? { allowed: false, reason: "denied" } : { allowed: true, reason: "ok" }; },
    discoverPlugins: async () => { discoveries++; return (options.discover ?? (async () => RECORDS))(); },
    pluginActivationRepo: { getActivation: async (lookup) => { lookups.push(lookup); return lookup.pluginId === "alpha" ? ALPHA_ON : null; } },
    ...(conflicts === "none" ? {} : { listPluginConflicts: async () => conflicts }),
    ...(options.policy === "none" ? {} : { pluginSourcePolicy: createPluginSourcePolicy({ hosted: true, localInstallOptIn: options.policy ?? true }, {}) }),
    ...(options.installer === "none" ? {} : { pluginInstaller: INSTALLER }),
  };
  const app = express();
  if (options.principal !== "none") app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerPluginsListRoute(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  const get = async (workspaceId = WS) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/v1/workspaces/${workspaceId}/plugins`);
    return { status: response.status, body: await response.json() };
  };
  return { get, authorizations, lookups, discoveries: () => discoveries };
}

/** The wire row `toAdminPluginResponse()` projects for one fixture record. */
const row = (record: PluginDiscoveryRecord, extra: { enabled: boolean; conflicts: readonly PluginConflict[] }) => ({
  id: record.id, name: record.name, version: record.version, source: record.source, tier: record.tier, status: record.status, enabled: extra.enabled, quarantine: null, errors: [], conflicts: extra.conflicts,
});
const INTERNAL = { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } };

test("lists every discovered plugin with its activation state and its own name conflicts, in discovery order", async (t) => {
  const h = await boot(t);
  assert.deepEqual(await h.get(), {
    status: 200,
    body: { plugins: [row(RECORDS[0]!, { enabled: true, conflicts: [CONFLICT] }), row(RECORDS[1]!, { enabled: false, conflicts: [] })], installSources: ["folder", "zip"] },
  });
});

test("each record's activation is read for this workspace by plugin id", async (t) => {
  const h = await boot(t);
  await h.get();
  assert.deepEqual(h.lookups, [{ workspaceId: WS, pluginId: "alpha" }, { workspaceId: WS, pluginId: "beta" }]);
});

test("without a wired conflicts port every row carries no conflicts", async (t) => {
  const h = await boot(t, { conflicts: "none" });
  const { body } = await h.get();
  assert.deepEqual(body.plugins.map((plugin: { conflicts: unknown }) => plugin.conflicts), [[], []]);
});

test("the list asks authorize() for admin.plugins.read on this workspace as the signed-in principal", async (t) => {
  const h = await boot(t);
  await h.get();
  assert.deepEqual(h.authorizations, [{ principalId: "owner", permission: "admin.plugins.read", workspaceId: WS }]);
});

test("another workspace gets 404 before any authorization or discovery", async (t) => {
  const h = await boot(t);
  assert.deepEqual(await h.get("ws-2"), { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(h.authorizations, []);
  assert.equal(h.discoveries(), 0);
});

test("a principal without admin.plugins.read gets the standard 403 and no inventory", async (t) => {
  const h = await boot(t, { allowed: false });
  assert.deepEqual(await h.get(), {
    status: 403,
    body: { error: "principal 'owner' is not authorized for 'admin.plugins.read' (denied)", code: "FORBIDDEN", details: { permission: "admin.plugins.read", reason: "denied" } },
  });
  assert.equal(h.discoveries(), 0);
});

test("a route reached without a signed-in principal answers the opaque 500", async (t) => {
  const h = await boot(t, { principal: "none" });
  assert.deepEqual(await h.get(), INTERNAL);
  assert.equal(h.discoveries(), 0);
});

test("a discovery failure answers the opaque 500 without leaking its message", async (t) => {
  const h = await boot(t, { discover: async () => { throw new Error("/private/install/dir unreadable"); } });
  assert.deepEqual(await h.get(), INTERNAL);
});

test("installSources is empty when the source policy keeps local installs off", async (t) => {
  const h = await boot(t, { policy: false });
  assert.deepEqual((await h.get()).body.installSources, []);
});

test("installSources is empty when no installer is wired, even with local installs on", async (t) => {
  const h = await boot(t, { installer: "none" });
  assert.deepEqual((await h.get()).body.installSources, []);
});

test("without a wired source policy, a hosted server without the env opt-in offers no install sources", async (t) => {
  const previous = { fly: process.env.FLY_APP_NAME, optIn: process.env.TOVU_PLUGIN_LOCAL_INSTALL };
  process.env.FLY_APP_NAME = "hosted-test";
  delete process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  t.after(() => {
    if (previous.fly === undefined) delete process.env.FLY_APP_NAME; else process.env.FLY_APP_NAME = previous.fly;
    if (previous.optIn === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = previous.optIn;
  });
  const h = await boot(t, { policy: "none" });
  assert.deepEqual((await h.get()).body.installSources, []);
});
