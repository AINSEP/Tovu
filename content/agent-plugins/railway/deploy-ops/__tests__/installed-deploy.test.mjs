import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forceRemove } from "../../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/force-remove.ts";
import { resolveAgentPluginLayout } from "../../../../../apps/website/src/features/agent-plugins/layout.ts";
import { createTovuAgentPluginLifecycle, seedBundledAgentPlugins } from "../../../../../apps/website/src/features/agent-plugins/lifecycle.ts";
import { agentPluginActivations } from "../../../../../apps/website/src/features/agent-plugins/activation-effects.ts";
import { loadDeployOpsRegistry } from "../../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";
import { AesGcmSecretSealer } from "../../../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.ts";
import { InMemoryKeyring } from "../../../../../apps/website/src/features/webhooks/keyring.memory.ts";
import { InMemoryCustomCredentialSetRepo } from "../../../../../apps/website/src/features/custom-credentials/repo.memory.ts";
import { createCustomCredential } from "../../../../../apps/website/src/features/custom-credentials/store.ts";
import { runDeploy, runDeployOps } from "../../../../../apps/website/src/features/deployments/deploy-ops/run-ops.ts";
import { AT, API, RUN, OTHER, TARGET, discovery, deployed, request } from "./fixtures.mjs";

const CONTENT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKSPACE_ID = "workspace-local";

/** Uses production credential storage and HTTP binding with simulated replies, never live I/O. */
async function credentialDeps({ registry }, _options = {}) {
  const repo = new InMemoryCustomCredentialSetRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse(AT) };
  await createCustomCredential({ repo, keyring, sealer, clock, idGen: { newId: () => "test-credential" } }, { workspaceId: WORKSPACE_ID, label: "Railway API", category: "hosting", baseUrl: API, connection: { token: "saved-private-token" } });
  const calls = [];
  const replies = [discovery(), { serviceInstanceDeployV2: RUN }, { deployment: deployed() }, { deployment: deployed() }, { deploymentLogs: [{ message: "ready" }] }];
  const httpClient = { send: async input => {
    calls.push(input);
    assert.equal(input.url, API);
    assert.equal(input.method, "POST");
    assert.ok(calls.length <= replies.length, "Unexpected request");
    return { status: 200, headers: {}, bodyText: JSON.stringify({ data: replies[calls.length - 1] }) };
  } };
  return { calls, deps: { workspaceId: WORKSPACE_ID, authorize: async () => ({ allowed: true, reason: "matched" }), customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, deployOpsHttpClient: httpClient, clock, loadAuthSchemes: async () => [], loadDeployOps: async () => registry } };
}

test("installed Railway contributes deploy and observes its returned run through the bound host", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-railway-installed-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const layout = resolveAgentPluginLayout();
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: "railway", enabled: true, actor: "test:operator" }, { origin: "bundled" });
    const registry = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
    assert.deepEqual(registry.refusals, []);
    assert.equal(typeof registry.get("railway")?.module.deploy, "function");
    const { deps, calls } = await credentialDeps({ registry });
    const input = { platform: "railway", target: TARGET, credentialLabel: "Railway API" };
    assert.equal((await runDeployOps(deps, { ...input, org: OTHER }, "listTargets")).targets[0].id, TARGET);
    const result = await runDeploy({ deps, input });
    assert.equal(result.started, true);
    assert.equal(result.runId, RUN);
    assert.equal((await runDeployOps(deps, { ...input, runId: result.runId }, "status")).state, "healthy");
    assert.deepEqual((await runDeployOps(deps, { ...input, runId: result.runId, limit: 1 }, "logs")).lines, [{ message: "ready" }]);
    assert.deepEqual(JSON.parse(calls[1].body), request({ operation: "deploy", variables: { serviceId: TARGET.split(":")[2], environmentId: TARGET.split(":")[1] } }).body);
    assert.equal(JSON.stringify(result).includes("saved-private-token"), false);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
});
