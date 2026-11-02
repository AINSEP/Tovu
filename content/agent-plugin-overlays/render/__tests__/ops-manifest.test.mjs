import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadDeployOpsRegistryFromSource } from "../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";
import { agentPluginSourceDir } from "../../../../development/test-support/agent-plugin-source.mjs";
import { parsePluginCredentialCards } from "../../../../apps/website/src/features/agent-plugins/credential-cards.ts";

// render ships from @jini-ai/agent-plugins/render: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: "render" });

test("Render manifest loads its contained module and fixed API host", async () => {
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "render", packageRoot: PLUGIN_DIR });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => ({ id: item.descriptor.id, hosts: item.descriptor.hosts })), [{ id: "render", hosts: ["api.render.com"] }]);
  const ops = registry.get("render").module;
  for (const verb of ["deploy", "listTargets", "status", "logs", "listSecrets", "setSecret", "unsetSecret"]) assert.equal(typeof ops[verb], "function");
  assert.equal(ops.readSecret, undefined);
});
test("Render keeps the 'soon' maturity flag and its owners probe parses on its owned API card", async () => {
  const raw = await readFile(path.join(PLUGIN_DIR, "plugin.json"), "utf8");
  const tovu = JSON.parse(raw).extensions.tovu;
  assert.equal(tovu.maturity, "soon"); assert.ok(tovu.provides.includes("deploy-ops:render"));
  assert.equal(tovu.credentialCards[0].probeUrl, "https://api.render.com/v1/owners?limit=1");
  const parsed = parsePluginCredentialCards({ raw }); assert.equal(parsed.ok, true);
  assert.equal(parsed.descriptors[0].probeUrl, "https://api.render.com/v1/owners?limit=1");
  assert.equal(parsed.descriptors[0].ownedApiLabel, "Render API");
});
