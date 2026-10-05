import assert from "node:assert/strict";
import test from "node:test";

import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import { setPluginEnabled } from "../../activation.js";
import { PluginConflictError } from "../../plugin-claims.js";
import type { PluginManifest } from "../../manifest.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import { composePluginRuntime, type PluginRuntimeSource } from "#src/server/runtime/composition/plugin-runtime";

/**
 * @file Conflict detection wired through the real composition (`composePluginRuntime`): enable time
 * refuses the newer plugin and leaves no enabled row behind; boot quarantines the newer of two
 * already-enabled plugins (persisted, with a human reason) and still attaches the older one; the
 * admin/agent projection (`listPluginConflicts`) names the clash for a plugin that is off.
 */

const WORKSPACE = "ws-1";
const clock = (iso = "2026-10-04T00:00:00.000Z") => ({ nowMs: () => Date.parse(iso) });

function source(id: string, contributes: PluginManifest["contributes"]): PluginRuntimeSource {
  return {
    source: "built-in",
    entryPath: `built-in:${id}`,
    manifest: {
      id, name: `Plugin ${id}`, version: "1.0.0", sdkRange: "^0.1.0 || ^0.2.0", engine: 1, tier: "tier-3",
      capabilities: ["hooks.attach"], hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE],
      fields: [{ path: `ext.${id}.seen`, type: "boolean", queryable: false }], integrity: {}, contributes,
    },
    importModule: async () => ({ default: definePlugin({ setup(sdk) { sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, async () => ({ seen: true })); } }) }),
  };
}

const ENTRY = { id: "entry", workspaceId: WORKSPACE, title: "Entry", slug: "entry", status: "draft" as const, bodyJson: {}, ext: {} };

test("enable time: turning on a plugin whose tool is already provided by an enabled plugin is refused, and its row is restored", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const sources = [source("shop-a", { tools: ["shop_list"] }), source("shop-b", { tools: ["shop_list"] })];
  const runtime = composePluginRuntime({ workspaceId: WORKSPACE, clock: clock(), activationRepo: repo, sources });
  const deps = { clock: clock(), repo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled };

  await setPluginEnabled({ deps, input: { workspaceId: WORKSPACE, pluginId: "shop-a", enabled: true } });
  await assert.rejects(
    setPluginEnabled({ deps, input: { workspaceId: WORKSPACE, pluginId: "shop-b", enabled: true } }),
    (error: unknown) => {
      assert.ok(error instanceof PluginConflictError);
      assert.equal(error.pluginId, "shop-b");
      assert.deepEqual(error.conflicts.map((c) => `${c.kind}:${c.key}<-${c.heldBy}`), ["tool:shop_list<-shop-a"]);
      return true;
    },
  );
  assert.equal(await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "shop-b" }), null, "no enabled row is left behind");
  assert.deepEqual(await runtime.beforeSaveHook(ENTRY), { "shop-a": { seen: true } }, "only the first plugin runs");
});

test("enable time: a plugin claiming a core-reserved namespace is refused", async () => {
  const repo = new InMemoryPluginActivationRepo();
  const sources = [source("api-squatter", { routes: ["GET /api/posts"] })];
  const runtime = composePluginRuntime({ workspaceId: WORKSPACE, clock: clock(), activationRepo: repo, sources, coreClaims: [{ kind: "route", key: "/api/*", mode: "exclusive" }] });
  await assert.rejects(runtime.onPluginEnabled("api-squatter"), (error: unknown) => error instanceof PluginConflictError && error.conflicts[0]?.heldBy === "core");
});

test("boot: of two already-enabled plugins claiming the same setting, the newer is quarantined with a reason and the older still runs", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ workspaceId: WORKSPACE, pluginId: "older", version: "1.0.0", enabled: true, updatedAt: "2026-09-01T00:00:00.000Z" });
  await repo.save({ workspaceId: WORKSPACE, pluginId: "newer", version: "1.0.0", enabled: true, updatedAt: "2026-09-02T00:00:00.000Z" });
  const sources = [source("newer", { settings: ["shop.currency"] }), source("older", { settings: ["shop.currency"] })];
  const runtime = composePluginRuntime({ workspaceId: WORKSPACE, clock: clock(), activationRepo: repo, sources });

  await runtime.attachEnabledPluginsAtBoot();

  const quarantined = await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "newer" });
  assert.equal(quarantined?.enabled, false);
  assert.equal(quarantined?.quarantinedAt, "2026-10-04T00:00:00.000Z");
  assert.equal(quarantined?.quarantineFailureCount, 0);
  assert.match(quarantined?.quarantineReason ?? "", /setting 'shop\.currency' is provided by plugin 'older'/);
  assert.equal((await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "older" }))?.enabled, true);
  assert.deepEqual(await runtime.beforeSaveHook(ENTRY), { older: { seen: true } });
});

test("listPluginConflicts: a plugin that is off is reported with the clash it would hit if turned on", async () => {
  const repo = new InMemoryPluginActivationRepo();
  await repo.save({ workspaceId: WORKSPACE, pluginId: "running", version: "1.0.0", enabled: true, updatedAt: "2026-09-01T00:00:00.000Z" });
  const sources = [source("running", { widgets: ["cart"] }), source("waiting", { widgets: ["cart"] })];
  const runtime = composePluginRuntime({ workspaceId: WORKSPACE, clock: clock(), activationRepo: repo, sources });
  const conflicts = await runtime.listPluginConflicts();
  assert.deepEqual([...conflicts.keys()], ["waiting"]);
  assert.equal(conflicts.get("waiting")?.[0]?.heldBy, "running");
});
