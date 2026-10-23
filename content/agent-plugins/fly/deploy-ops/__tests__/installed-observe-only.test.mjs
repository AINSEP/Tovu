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

// Moved from core deploy-ops/__tests__/installed-deploy-verb.test.ts ("... and fly stays observe-only"):
// seeded from this build, the installed Fly adapter loads without refusals and exports no deploy verb.
const CONTENT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKSPACE_ID = "workspace-local";

test("seeded from this build, the installed fly adapter stays observe-only", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-ops-verb-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const layout = resolveAgentPluginLayout();
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: "fly", enabled: true, actor: "test:operator" }, { origin: "bundled" });
    const registry = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
    assert.deepEqual(registry.refusals, []);
    assert.equal(typeof registry.get("fly")?.module.status, "function");
    assert.equal(registry.get("fly")?.module.deploy, undefined);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
});
