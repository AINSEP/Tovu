import assert from "node:assert/strict";
import test from "node:test";
import { createPluginContributionLoader } from "@jini-ai/agent-plugins/lifecycle";
import { loadDeployTargetRegistry, loadInstalledDeployTargets } from "../registry.js";

function fixture(_required: Record<string, never>, _optional: Record<string, never> = {}) {
  const enabled = new Set(["host-a", "host-b", "host-c"]);
  const imports: string[] = [];
  const files = new Map(["host-a", "host-b", "host-c", "host-d", "host-e"].map(id => [id,
    JSON.stringify({ schemaVersion: 1, targets: [{ id, label: id, module: "target.mjs" }] }),
  ]));
  const loader = createPluginContributionLoader({
    findPackages: async query => {
      assert.equal(query.workspaceId, "site");
      return [...files.keys()].filter(id => !query.requireActive || enabled.has(id))
        .map(pluginId => ({ trusted: { pluginId, packageRoot: "/unused" } }));
    },
    readFile: async ({ plugin }) => files.get(plugin.pluginId)!,
    importModule: async ({ plugin }) => {
      assert.ok(enabled.has(plugin.pluginId), "disabled modules must never execute");
      imports.push(plugin.pluginId);
      return { exported: { create: () => { throw new Error("No publishing in discovery"); } } };
    },
  });
  return { ...loader, enabled, imports, files, readEnabled: async ({ pluginId }: { pluginId: string }) => enabled.has(pluginId) };
}

test("five installed hosts include two disabled hosts; enabling permits only the existing executable loader", async () => {
  const f = fixture({});
  const readInventory = () => loadInstalledDeployTargets({ workspaceId: "site", loadContributions: f.loadPluginContributions, readEnabled: f.readEnabled });
  const inventory = await readInventory();
  assert.deepEqual(inventory.items.map(item => [item.pluginId, item.enabled]), [
    ["host-a", true], ["host-b", true], ["host-c", true], ["host-d", false], ["host-e", false],
  ]);
  assert.deepEqual([...f.imports], []);
  const registry = await loadDeployTargetRegistry({ workspaceId: "site" }, { loadContributions: f.loadPluginContributions });
  assert.deepEqual(registry.list().map(item => item.descriptor.id), ["host-a", "host-b", "host-c"]);
  f.enabled.add("host-d");
  assert.equal((await readInventory()).items.find(item => item.pluginId === "host-d")?.enabled, true);
  assert.ok((await loadDeployTargetRegistry({ workspaceId: "site" }, { loadContributions: f.loadPluginContributions })).get("host-d"));
  assert.ok(!f.imports.includes("host-e"));
});

test("inventory preserves trust/parser refusals and refuses ambiguous ids without importing modules", async () => {
  const f = fixture({});
  f.files.set("host-b", "invalid JSON");
  f.files.set("host-c", f.files.get("host-a")!);
  const loader = createPluginContributionLoader({
    findPackages: async query => {
      assert.equal(query.requireActive, false);
      return [{ refusal: "deploy targets from 'tampered' were not loaded: bundled digest mismatch" },
        ...[...f.files.keys()].map(pluginId => ({ trusted: { pluginId, packageRoot: "/unused" } }))];
    },
    readFile: async ({ plugin }) => f.files.get(plugin.pluginId)!,
    importModule: async () => { throw new Error("Data inventory must not import code"); },
  });
  const result = await loadInstalledDeployTargets({ workspaceId: "site", loadContributions: loader.loadPluginContributions, readEnabled: f.readEnabled });
  assert.deepEqual(result.items.map(item => item.pluginId), ["host-d", "host-e"]);
  assert.equal(result.refusals.length, 3);
  assert.match(result.refusals.join("\n"), /bundled digest mismatch/);
  assert.match(result.refusals.join("\n"), /invalid.*not valid JSON/);
  assert.match(result.refusals.join("\n"), /more than one plugin/);
});
