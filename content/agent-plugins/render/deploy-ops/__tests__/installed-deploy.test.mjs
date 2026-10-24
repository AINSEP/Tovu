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
import { runDeploy, runDeployOps } from "../../../../../apps/website/src/features/deployments/deploy-ops/run-ops.ts";
import { AesGcmSecretSealer } from "../../../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.ts";
import { InMemoryKeyring } from "../../../../../apps/website/src/features/webhooks/keyring.memory.ts";
import { InMemoryCustomCredentialSetRepo } from "../../../../../apps/website/src/features/custom-credentials/repo.memory.ts";
import { createCustomCredential } from "../../../../../apps/website/src/features/custom-credentials/store.ts";
import { API, TARGET, RUN, SERVICE, AT, context, response } from "./fixtures.mjs";

// Real installed lifecycle and credential/dispatch boundaries; simulated HTTP only, no network.
test("installed Render deploys and observes the returned ID through the guarded host", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-render-installed-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const layout = resolveAgentPluginLayout(); const workspaceId = "workspace-local";
    await seedBundledAgentPlugins({ layout, workspaceId, sourceRoot: fileURLToPath(new URL("../../../", import.meta.url)) });
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(workspaceId).root, pluginId: "render", enabled: true, actor: "test:operator" }, { origin: "bundled" });
    const loadContributions = createTovuAgentPluginLifecycle({ layout }).loadPluginContributions;
    const loadDeployOps = input => loadDeployOpsRegistry(input, { loadContributions });
    const registry = await loadDeployOps({ workspaceId });
    assert.deepEqual(registry.refusals, []); assert.equal(typeof registry.get("render")?.module.deploy, "function");
    const repo = new InMemoryCustomCredentialSetRepo(); const keyring = new InMemoryKeyring();
    const sealer = new AesGcmSecretSealer(keyring); const clock = { nowMs: () => Date.parse(AT) };
    await createCustomCredential({ repo, keyring, sealer, clock, idGen: { newId: () => "credential-one" } }, { workspaceId, label: "Render API", category: "ops", baseUrl: API, connection: { token: "simulated-private-token" } });
    const fake = context([{ url: `${API}/services/${TARGET}`, json: SERVICE }, { method: "POST", url: `${API}/services/${TARGET}/deploys`, body: {}, response: response({ id: RUN }, 201) }, { url: `${API}/services/${TARGET}/deploys/${RUN}`, json: { id: RUN, status: "live" } }]);
    const deps = { workspaceId, authorize: async () => ({ allowed: true, reason: "matched" }), customCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, clock, loadAuthSchemes: async () => [], loadDeployOps, deployOpsHttpClient: { send: async request => {
      assert.equal(request.headers.Authorization, "Bearer simulated-private-token");
      const result = request.method === "GET" ? await fake.get(request.url) : await fake.send({ method: request.method, url: request.url, body: JSON.parse(request.body) });
      return { status: result.status, headers: {}, bodyText: result.text };
    } } };
    const input = { platform: "render", target: TARGET, credentialLabel: "Render API" };
    const accepted = await runDeploy({ deps, input }); assert.equal(accepted.runId, RUN);
    const status = await runDeployOps(deps, { ...input, runId: accepted.runId }, "status");
    assert.equal(status.state, "healthy"); assert.equal(JSON.stringify({ accepted, status }).includes("simulated-private-token"), false); fake.done();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
});
