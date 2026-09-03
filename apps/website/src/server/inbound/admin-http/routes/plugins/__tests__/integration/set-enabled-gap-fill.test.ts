import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { InMemoryPluginActivationRepo } from "#src/features/plugin-runtime/repo.memory";
import { PluginLoadError } from "#src/features/plugin-runtime/loader";
import { registerPluginSetEnabledRoute } from "../../set-enabled.js";
import type { PluginsRouteDeps } from "../../deps.js";
import type { PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";

/**
 * @file Coverage-gap-fill for `plugins/set-enabled.ts` — branches
 * `plugins-http.integration.test.ts` doesn't already reach: workspace-id mismatch, the
 * `PLUGIN_INCOMPATIBLE`/`PLUGIN_LOAD_FAILED`/generic-500 error mappings, the disable direction, the
 * `enabled` body-coercion fallback, and — most load-bearing for the "does a half-failed mutation
 * leave a phantom activation behind" question — both directions of `rollbackPluginActivation` when
 * `changeSets.insert()` fails AFTER `setPluginEnabled()` already applied and already ran the
 * load/unload side effect.
 */
const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}`;

const DISCOVERY: readonly PluginDiscoveryRecord[] = [
  { id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", errors: [] },
  {
    id: "incompatible-plugin",
    name: "Incompatible Plugin",
    version: "2.0.0",
    source: "site",
    tier: "tier-2",
    status: "incompatible",
    errors: [{ code: "SDK_VERSION_MISMATCH", file: "tovu.plugin.json", message: "requires a newer SDK" }],
  },
];

function buildTestApp(overrides: Partial<PluginsRouteDeps> = {}): { app: express.Express; pluginDeps: PluginsRouteDeps } {
  const baseDeps = createRouteDeps();
  const onEnabledCalls: string[] = [];
  const onDisabledCalls: string[] = [];
  const pluginDeps: PluginsRouteDeps = {
    workspaceId: baseDeps.workspaceId,
    authorize: baseDeps.authorize,
    clock: baseDeps.clock,
    idGen: baseDeps.idGen,
    changeSets: baseDeps.changeSets,
    outbox: baseDeps.outbox,
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => DISCOVERY,
    onPluginEnabled: async (id: string) => {
      onEnabledCalls.push(id);
    },
    onPluginDisabled: (id: string) => {
      onDisabledCalls.push(id);
    },
    onPluginUninstalled: async () => {},
    ...overrides,
  };
  (pluginDeps as unknown as { onEnabledCalls: string[] }).onEnabledCalls = onEnabledCalls;
  (pluginDeps as unknown as { onDisabledCalls: string[] }).onDisabledCalls = onDisabledCalls;

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerPluginSetEnabledRoute(app, pluginDeps);
  return { app, pluginDeps };
}

test("set-enabled: a workspace id that is not this site's is 404 (checked before auth/discovery)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-ws/plugins/word-count`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("set-enabled: 403s (via executeCommand's own authorize gate) for a caller without admin.plugins.enable, and no activation row is written", async (t) => {
  const { app, pluginDeps } = buildTestApp({ authorize: async () => ({ allowed: false, reason: "insufficient role" }) });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${BASE}/plugins/word-count`.replace(BASE, `${baseUrl}${BASE}`), {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code?: string; details?: { permission?: string; reason?: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details?.permission, "admin.plugins.enable");

  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "word-count" });
  assert.equal(stored, null, "a denied caller must never leave an activation row behind");
});

test("set-enabled: PATCH for an incompatible plugin is 422 PLUGIN_INCOMPATIBLE, and no activation row is written", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/plugins/incompatible-plugin`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json() as { code?: string }).code, "PLUGIN_INCOMPATIBLE");

  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "incompatible-plugin" });
  assert.equal(stored, null);
});

test("set-enabled: an enable whose load hook throws PluginLoadError maps to 500 PLUGIN_LOAD_FAILED with pluginId/reason, and the activation row is NOT left enabled (activation.ts's own compensation)", async (t) => {
  const { app, pluginDeps } = buildTestApp({
    onPluginEnabled: async () => {
      throw new PluginLoadError("word-count", "runtime-error");
    },
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/plugins/word-count`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { code?: string; details?: { pluginId?: string; reason?: string } };
  assert.equal(body.code, "PLUGIN_LOAD_FAILED");
  assert.equal(body.details?.pluginId, "word-count");

  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "word-count" });
  assert.equal(stored, null, "a first-time enable whose load hook fails must not leave a phantom enabled row");
});

test("set-enabled: PATCH {enabled:false} disables a plugin and invokes onPluginDisabled (not onPluginEnabled)", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  await pluginDeps.pluginActivationRepo.save({
    pluginId: "word-count",
    workspaceId: WORKSPACE_ID,
    version: "1.0.0",
    enabled: true,
    updatedAt: pluginDeps.clock.nowIso(),
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/plugins/word-count`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(res.status, 200);
  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "word-count" });
  assert.equal(stored?.enabled, false);
  assert.deepEqual((pluginDeps as unknown as { onDisabledCalls: string[] }).onDisabledCalls, ["word-count"]);
  assert.deepEqual((pluginDeps as unknown as { onEnabledCalls: string[] }).onEnabledCalls, []);
});

test("set-enabled: an omitted request body coerces `enabled` to false (Boolean(req.body?.enabled) fallback), reachable through a real content-type-less PATCH", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  await pluginDeps.pluginActivationRepo.save({
    pluginId: "word-count",
    workspaceId: WORKSPACE_ID,
    version: "1.0.0",
    enabled: true,
    updatedAt: pluginDeps.clock.nowIso(),
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/plugins/word-count`, { method: "PATCH", headers: { cookie } });
  assert.equal(res.status, 200);
  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "word-count" });
  assert.equal(stored?.enabled, false, "an omitted body must be treated as enabled:false, never left ambiguous");
});

test("set-enabled: a record-persistence failure AFTER a successful first-time enable rolls the activation row back to deleted and re-invokes onPluginDisabled (INV-01: no mutation without a record)", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  pluginDeps.changeSets.insert = async () => {
    throw new Error("change-set store unavailable");
  };
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/plugins/word-count`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });

  // rollbackPluginActivation: no priorActivation existed -> the row this request just wrote is
  // deleted, and the compensating side effect is onPluginDisabled (priorActivation?.enabled is
  // falsy for a null prior row) -- proving the plugin is NOT left silently active after the
  // record failed to persist.
  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "word-count" });
  assert.equal(stored, null);
  assert.deepEqual((pluginDeps as unknown as { onDisabledCalls: string[] }).onDisabledCalls, ["word-count"]);
});

test("set-enabled: a record-persistence failure AFTER disabling a previously-enabled plugin restores the PRIOR enabled row and re-invokes onPluginEnabled", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  await pluginDeps.pluginActivationRepo.save({
    pluginId: "word-count",
    workspaceId: WORKSPACE_ID,
    version: "1.0.0",
    enabled: true,
    updatedAt: pluginDeps.clock.nowIso(),
  });
  pluginDeps.changeSets.insert = async () => {
    throw new Error("change-set store unavailable");
  };
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/plugins/word-count`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(res.status, 500);

  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "word-count" });
  assert.equal(stored?.enabled, true, "the prior enabled row must be restored, not left disabled, when the record write fails");
  assert.deepEqual((pluginDeps as unknown as { onEnabledCalls: string[] }).onEnabledCalls, ["word-count"]);
});

test("set-enabled: a record-persistence failure AFTER re-enabling a previously-disabled plugin restores the PRIOR disabled row and re-invokes onPluginDisabled", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  await pluginDeps.pluginActivationRepo.save({
    pluginId: "word-count",
    workspaceId: WORKSPACE_ID,
    version: "0.9.0",
    enabled: false,
    updatedAt: pluginDeps.clock.nowIso(),
  });
  pluginDeps.changeSets.insert = async () => {
    throw new Error("change-set store unavailable");
  };
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${BASE}/plugins/word-count`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 500);

  const stored = await pluginDeps.pluginActivationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: "word-count" });
  assert.equal(stored?.enabled, false, "the prior DISABLED row must be restored (not left enabled) when the record write fails");
  assert.equal(stored?.version, "0.9.0", "restore is verbatim, including the version pointer AC-13 pins to the enable it inverts");
  // onPluginEnabled fires once for the request's own (successful) execute() step; onPluginDisabled
  // then fires again as rollback's compensation, since the restored PRIOR row is disabled -- hook
  // attachment ends up consistent with the row actually left in the repo (disabled), not with the
  // enable this request asked for.
  assert.deepEqual((pluginDeps as unknown as { onEnabledCalls: string[] }).onEnabledCalls, ["word-count"]);
  assert.deepEqual((pluginDeps as unknown as { onDisabledCalls: string[] }).onDisabledCalls, ["word-count"]);
});
