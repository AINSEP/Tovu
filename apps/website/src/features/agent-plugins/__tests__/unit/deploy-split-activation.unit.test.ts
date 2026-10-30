import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import { agentPluginActivations } from "../../activation-effects.js";

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { carryCloudflareActivation } from "../../deploy-split-activation.js";

/** @file Explicit Cloudflare rename decisions and unreadable activation state remain protected. */

const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;

async function withWorkspaceRoot(fn: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "tovu-deploy-split-"));
  try {
    await fn(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

test("unreadable activation state refuses carry and seeding without writing successor decisions", async () => {
  const { writeFile, readFile } = await import("node:fs/promises");
  const { createTovuAgentPluginLifecycle } = await import("../../lifecycle.js");
  const { resolveAgentPluginLayout } = await import("../../layout.js");
  await withWorkspaceRoot(async root => {
    const layout = resolveAgentPluginLayout({ siteDir: root }, { env: {} });
    const workspaceRoot = layout.forWorkspace("ws").root;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workspaceRoot, { recursive: true });
    const file = path.join(workspaceRoot, "activations.json");
    await writeFile(file, "{");
    await assert.rejects(carryCloudflareActivation({ workspaceRoot, activations: agentPluginActivations }));
    assert.equal(await readFile(file, "utf8"), "{");
    const seeded = await createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() }).seedBundledAgentPlugins({ layout, workspaceId: "ws", sourceRoot: path.resolve("content/agent-plugins") });
    assert.ok(seeded.outcomes.length > 0);
    assert.equal(seeded.outcomes.every(outcome => outcome.status === "failed"), true);
    assert.deepEqual(seeded.retirements, []);
    assert.equal(await readFile(file, "utf8"), "{");
  });
});

for (const enabled of [true, false]) test(`Cloudflare rename carries the previous ${enabled ? 'enabled' : 'disabled'} decision before seeding`, async () => {
  const { carryCloudflareActivation } = await import('../../deploy-split-activation.js');
  await withWorkspaceRoot(async workspaceRoot => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: 'cloudflare-pages', enabled, actor: 'operator' }, { origin: 'bundled' });
    await carryCloudflareActivation({ workspaceRoot, activations: agentPluginActivations });
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: 'cloudflare' }, { enabled: true });
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins.cloudflare?.enabled, enabled);
    const before = await readAgentPluginActivations({ workspaceRoot });
    await carryCloudflareActivation({ workspaceRoot, activations: agentPluginActivations });
    assert.deepEqual(await readAgentPluginActivations({ workspaceRoot }), before);
  });
});

test('Cloudflare explicit successor decision wins; absent predecessor stays absent', async () => {
  const { carryCloudflareActivation } = await import('../../deploy-split-activation.js');
  await withWorkspaceRoot(async workspaceRoot => {
    await carryCloudflareActivation({ workspaceRoot, activations: agentPluginActivations });
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins.cloudflare, undefined);
    await setAgentPluginActivation({ workspaceRoot, pluginId: 'cloudflare-pages', enabled: true, actor: 'operator' }, { origin: 'bundled' });
    await setAgentPluginActivation({ workspaceRoot, pluginId: 'cloudflare', enabled: false, actor: 'operator' }, { origin: 'bundled' });
    await carryCloudflareActivation({ workspaceRoot, activations: agentPluginActivations });
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins.cloudflare?.enabled, false);
  });
});

test('Cloudflare untouched seed records yield to explicit predecessor decisions; corrupt verdict refuses', async () => {
  const { carryCloudflareActivation } = await import('../../deploy-split-activation.js');
  await withWorkspaceRoot(async workspaceRoot => {
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: 'cloudflare-pages' });
    await carryCloudflareActivation({ workspaceRoot, activations: agentPluginActivations });
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins.cloudflare, undefined);
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: 'cloudflare' }, { enabled: true });
    await setAgentPluginActivation({ workspaceRoot, pluginId: 'cloudflare-pages', enabled: false, actor: 'operator' }, { origin: 'bundled' });
    await carryCloudflareActivation({ workspaceRoot, activations: agentPluginActivations });
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins.cloudflare?.enabled, false);
    await assert.rejects(carryCloudflareActivation({ workspaceRoot, activations: {
      ...agentPluginActivations, resolveAgentPluginActivation: async () => ({ verdict: 'undetermined', reason: 'corrupt predecessor' }),
    } }), /Cannot carry cloudflare-pages activation: corrupt predecessor/);
  });
});
