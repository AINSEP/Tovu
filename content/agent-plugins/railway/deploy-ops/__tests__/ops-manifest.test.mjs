import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDeployOpsRegistryFromSource } from "../../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";

test("Railway manifest loads the contained deploy adapter with only its GraphQL host", async () => {
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "railway", packageRoot: fileURLToPath(new URL("../../", import.meta.url)) });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => ({ id: item.descriptor.id, hosts: item.descriptor.hosts })), [{ id: "railway", hosts: ["backboard.railway.com"] }]);
  const module = registry.get("railway").module;
  for (const verb of ["listTargets", "deploy", "status", "logs", "listSecrets", "setSecret", "unsetSecret"]) assert.equal(typeof module[verb], "function", verb);
  assert.equal(module.readSecret, undefined);
});
test("Railway advertises deployment ops and keeps the 'soon' maturity flag and its existing token guidance", async () => {
  const plugin = JSON.parse(await readFile(new URL("../../plugin.json", import.meta.url), "utf8"));
  const tovu = plugin.extensions.tovu;
  assert.deepEqual(tovu.provides, ["deploy-config:railway", "deploy-ops:railway"]);
  assert.equal(tovu.maturity, "soon");
  const card = tovu.credentialCards[0];
  assert.equal(card.probeUrl, undefined);
  assert.equal(card.baseUrl, "https://backboard.railway.com/graphql/v2");
  assert.match(card.keyHint, /select the workspace/);
  assert.deepEqual(card.usedFor, ["Looks up your Railway projects", "Deploys your server"]);
  assert.doesNotMatch(JSON.stringify(plugin), /being added|Config generation only/);
});
