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

test("Phase B carries a post-Phase-A deploy off only to missing server successors", async () => {
  await withWorkspaceRoot(async workspaceRoot => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "operator" }, { origin: "bundled" });
    for (const pluginId of ["vercel", "netlify", "cloudflare-pages", "github-pages", "s3-compatible"]) {
      await setAgentPluginActivation({ workspaceRoot, pluginId, enabled: false, actor: DEPLOY_SPLIT_ACTOR }, { origin: "bundled" });
    }
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fly", enabled: true, actor: "operator" }, { origin: "bundled" });
    await setAgentPluginActivation({ workspaceRoot, pluginId: "railway", enabled: false, actor: "operator" }, { origin: "bundled" });
    const before = await readAgentPluginActivations({ workspaceRoot });
    assert.deepEqual(await carry(workspaceRoot), ["render"]);
    const after = await readAgentPluginActivations({ workspaceRoot });
    for (const [pluginId, record] of Object.entries(before.plugins)) assert.deepEqual(after.plugins[pluginId], record);
    assert.deepEqual(await carry(workspaceRoot), []);
    assert.deepEqual(await readAgentPluginActivations({ workspaceRoot }), after);
  });
});

test("unreadable activation state refuses carry and seeding without writing successor decisions", async () => {
  const { writeFile, readFile } = await import("node:fs/promises");
  const { createTovuAgentPluginLifecycle } = await import("../../lifecycle.js");
  const { resolveAgentPluginLayout } = await import("../../layout.js");
  await withWorkspaceRoot(async root => {
    const layout = resolveAgentPluginLayout({ siteDir: root, env: {} });
    const workspaceRoot = layout.forWorkspace("ws").root;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workspaceRoot, { recursive: true });
    const file = path.join(workspaceRoot, "activations.json");
    await writeFile(file, "{");
    await assert.rejects(carry(workspaceRoot));
    assert.equal(await readFile(file, "utf8"), "{");
    const seeded = await createTovuAgentPluginLifecycle({ layout }).seedBundledAgentPlugins({ layout, workspaceId: "ws", sourceRoot: path.resolve("content/agent-plugins") });
    assert.ok(seeded.outcomes.length > 0);
    assert.equal(seeded.outcomes.every(outcome => outcome.status === "failed"), true);
    assert.deepEqual(seeded.retirements, []);
    assert.equal(await readFile(file, "utf8"), "{");
  });
});

for (const malformedId of ["deploy", "render"]) {
  test(`unreadable ${malformedId} record refuses the whole carry before any successor write`, async () => {
    const { writeFile, readFile } = await import("node:fs/promises");
    await withWorkspaceRoot(async workspaceRoot => {
      await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "operator" }, { origin: "bundled" });
      const file = path.join(workspaceRoot, "activations.json");
      const value = JSON.parse(await readFile(file, "utf8"));
      value.plugins[malformedId] = { origin: "bundled", enabled: "unreadable" };
      const bytes = JSON.stringify(value);
      await writeFile(file, bytes);
      await assert.rejects(carry(workspaceRoot));
      assert.equal(await readFile(file, "utf8"), bytes);
    });
  });
}

test("carry retry preserves decisions already written before an activation writer failure", async () => {
  await withWorkspaceRoot(async workspaceRoot => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "operator" }, { origin: "bundled" });
    const activations = { ...agentPluginActivations, setAgentPluginActivation: async (...args: Parameters<typeof setAgentPluginActivation>) => {
      if (args[0].pluginId === "render") throw new Error("fixture write failure");
      return setAgentPluginActivation(...args);
    } };
    await assert.rejects(carryDeployDisabled({ workspaceRoot, activations }), { message: "fixture write failure" });
    const beforeRetry = await readAgentPluginActivations({ workspaceRoot });
    assert.equal(beforeRetry.plugins.fly?.enabled, false);
    assert.equal(beforeRetry.plugins.render, undefined);
    assert.deepEqual(await carry(workspaceRoot), ["render", "railway"]);
    const after = await readAgentPluginActivations({ workspaceRoot });
    for (const [pluginId, record] of Object.entries(beforeRetry.plugins)) assert.deepEqual(after.plugins[pluginId], record);
    assert.deepEqual(await carry(workspaceRoot), []);
  });
});
