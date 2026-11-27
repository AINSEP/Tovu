import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { agentPluginActivations, isAgentPluginEnabled } from "../../activation-effects.js";

test("the token and tool entry gate follows saved activation changes and fails closed on an unreadable ledger", async t => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "agent-plugin-activation-effects-"));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const plugin = { workspaceRoot, pluginId: "fixture-plugin" };
  assert.equal(await isAgentPluginEnabled(plugin), true, "no saved record retains the lifecycle default");
  await agentPluginActivations.setAgentPluginActivation({ ...plugin, enabled: false, actor: "operator" });
  assert.equal(await isAgentPluginEnabled(plugin), false);
  await agentPluginActivations.setAgentPluginActivation({ ...plugin, enabled: true, actor: "operator" });
  assert.equal(await isAgentPluginEnabled(plugin), true);
  await writeFile(path.join(workspaceRoot, "activations.json"), "{ malformed");
  assert.equal(await isAgentPluginEnabled(plugin), false);
});
