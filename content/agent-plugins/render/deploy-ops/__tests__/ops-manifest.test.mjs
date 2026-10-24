import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadDeployOpsRegistryFromSource } from "../../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";
import { parsePluginCredentialCards } from "../../../../../apps/website/src/features/agent-plugins/credential-cards.ts";

test("Render manifest loads its contained module and fixed API host", async () => {
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "render", packageRoot: fileURLToPath(new URL("../../", import.meta.url)) });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => ({ id: item.descriptor.id, hosts: item.descriptor.hosts })), [{ id: "render", hosts: ["api.render.com"] }]);
  const ops = registry.get("render").module;
  for (const verb of ["deploy", "listTargets", "status", "logs", "listSecrets", "setSecret", "unsetSecret"]) assert.equal(typeof ops[verb], "function");
  assert.equal(ops.readSecret, undefined);
});
test("Render stays untested and its owners probe parses on its owned API card", async () => {
  const raw = await readFile(new URL("../../plugin.json", import.meta.url), "utf8");
  const tovu = JSON.parse(raw).extensions.tovu;
  assert.equal(tovu.maturity, "untested"); assert.ok(tovu.provides.includes("deploy-ops:render"));
  // The card parser keeps probeUrl once the save-probe shard lands; until then it must still parse.
  assert.equal(tovu.credentialCards[0].probeUrl, "https://api.render.com/v1/owners?limit=1");
  const parsed = parsePluginCredentialCards({ raw }); assert.equal(parsed.ok, true);
  assert.equal(parsed.descriptors[0].ownedApiLabel, "Render API");
});
