import { agentPluginActivations } from "../../activation-effects.js";

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { carryDeployDisabled, DEPLOY_SPLIT_ACTOR, DEPLOY_SPLIT_HOST_PLUGIN_IDS } from "../../deploy-split-activation.js";

/**
 * @file `deploy-split-activation.ts` — an operator's "Deploy Online off" carries to the split-out host
 * plugins before the seeder switches them on; nothing else is touched. Real activation file, real writer.
 */

const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;

async function withWorkspaceRoot(fn: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "tovu-deploy-split-"));
  try {
    await fn(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

const carry = (workspaceRoot: string) => carryDeployDisabled({ workspaceRoot, activations: agentPluginActivations });

test("an operator's deploy 'off' is carried to every host plugin, and the seeder then leaves them off", async () => {
  await withWorkspaceRoot(async (workspaceRoot) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "operator" }, { origin: "bundled" });

    assert.deepEqual(await carry(workspaceRoot), DEPLOY_SPLIT_HOST_PLUGIN_IDS);

    for (const pluginId of DEPLOY_SPLIT_HOST_PLUGIN_IDS) {
      await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId }, { enabled: true });
      const record = (await readAgentPluginActivations({ workspaceRoot })).plugins[pluginId];
      assert.equal(record?.enabled, false, pluginId);
      assert.equal(record?.updatedBy, DEPLOY_SPLIT_ACTOR, pluginId);
    }
  });
});

for (const [name, setup] of [
  ["absent", async () => {}],
  ["enabled", async (workspaceRoot: string) => { await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: true, actor: "operator" }, { origin: "bundled" }); }],
  ["the seeder's own untouched disabled record", async (workspaceRoot: string) => { await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: "deploy" }); }],
] as const) {
  test(`deploy ${name}: nothing is written`, async () => {
    await withWorkspaceRoot(async (workspaceRoot) => {
      await setup(workspaceRoot);
      const before = await readAgentPluginActivations({ workspaceRoot });

      assert.deepEqual(await carry(workspaceRoot), []);
      assert.deepEqual(await readAgentPluginActivations({ workspaceRoot }), before);
    });
  });
}

test("a host that already has a record keeps it, and a second run writes nothing", async () => {
  await withWorkspaceRoot(async (workspaceRoot) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "operator" }, { origin: "bundled" });
    await setAgentPluginActivation({ workspaceRoot, pluginId: "vercel", enabled: true, actor: "operator" }, { origin: "bundled" });

    assert.deepEqual(await carry(workspaceRoot), DEPLOY_SPLIT_HOST_PLUGIN_IDS.filter((pluginId) => pluginId !== "vercel"));
    const after = await readAgentPluginActivations({ workspaceRoot });
    assert.equal(after.plugins.vercel?.enabled, true);
    assert.equal(after.plugins.vercel?.updatedBy, "operator");

    assert.deepEqual(await carry(workspaceRoot), []);
    assert.deepEqual(await readAgentPluginActivations({ workspaceRoot }), after);
  });
});
