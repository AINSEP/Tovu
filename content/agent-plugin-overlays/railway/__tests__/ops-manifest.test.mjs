import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadDeployOpsRegistryFromSource } from "../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";
import { agentPluginSourceDir } from "../../../../development/test-support/agent-plugin-source.mjs";

// railway ships from @jini-ai/agent-plugins/railway: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: "railway" });

test("Railway manifest loads the contained deploy adapter with only its GraphQL host", async () => {
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "railway", packageRoot: PLUGIN_DIR });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => ({ id: item.descriptor.id, hosts: item.descriptor.hosts })), [{ id: "railway", hosts: ["backboard.railway.com"] }]);
  const module = registry.get("railway").module;
  for (const verb of ["listTargets", "deploy", "status", "logs", "listSecrets", "setSecret", "unsetSecret"]) assert.equal(typeof module[verb], "function", verb);
  assert.equal(module.readSecret, undefined);
});
test("Railway advertises deployment ops and keeps the 'soon' maturity flag and its existing token guidance", async () => {
  const plugin = JSON.parse(await readFile(path.join(PLUGIN_DIR, "plugin.json"), "utf8"));
  const tovu = plugin.extensions.jini;
  assert.deepEqual(tovu.provides, ["deploy-config:railway", "deploy-ops:railway"]);
  assert.equal(tovu.maturity, "soon");
  const card = tovu.credentialCards[0];
  assert.equal(card.probeUrl, undefined);
  assert.equal(card.baseUrl, "https://backboard.railway.com/graphql/v2");
  assert.match(card.keyHint, /select the workspace/);
  assert.deepEqual(card.usedFor, ["Looks up your Railway projects", "Deploys your server"]);
  assert.doesNotMatch(JSON.stringify(plugin), /being added|Config generation only/);
});
