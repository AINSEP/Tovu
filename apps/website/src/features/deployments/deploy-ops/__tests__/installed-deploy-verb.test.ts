import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { resolveAgentPluginLayout } from "../../../agent-plugins/layout.js";
import { loadDeployOpsRegistry } from "../registry.js";

/**
 * The split upgrade of the retired `deploy` record across the bundled packages. The digest re-trust
 * cases that lived here ("the boot seeder re-trusts the new digest, so the deploy verb actually loads
 * after an upgrade") moved into content/agent-plugins/github/deploy-ops/__tests__/installed-deploy-verb.test.mjs,
 * and Fly's observe-only check into content/agent-plugins/fly/deploy-ops/__tests__/installed-observe-only.test.mjs.
 */
const CONTENT_ROOT = path.resolve("content/agent-plugins");
const WORKSPACE_ID = "workspace-local";

async function withAgentPluginsDir<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-ops-verb-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try { return await fn(resolveAgentPluginLayout()); }
  finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

// Owner override (2026-10-12): Actions deploys live in `github` and follow its switch; Fly follows
// the carried `deploy` decision. Source control and backup keep the same `github` record.
for (const deployEnabled of [false, true]) {
  for (const githubEnabled of [false, true]) {
    test(`split upgrade: deploy=${deployEnabled}, github=${githubEnabled} — Actions follows github, Fly follows deploy`, async () => {
      const { loadSourceControlProviderRegistry } = await import("../../../source-control/provider-registry.js");
      await withAgentPluginsDir(async layout => {
        const lifecycle = createTovuAgentPluginLifecycle({ layout });
        const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
        await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: deployEnabled, actor: "operator" }, { origin: "bundled" });
        await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: "github", enabled: githubEnabled, actor: "operator" }, { origin: "bundled" });
        const githubBefore = (await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins.github;
        const result = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
        for (const pluginId of ["fly", "render", "railway", "github"]) assert.equal(result.outcomes.find(outcome => outcome.pluginId === pluginId)?.status, "seeded", pluginId);
        const ops = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: lifecycle.loadPluginContributions });
        assert.deepEqual(ops.refusals, []);
        assert.equal(ops.get("github-actions")?.pluginId, githubEnabled ? "github" : undefined);
        assert.equal(ops.get("fly")?.pluginId, deployEnabled ? "fly" : undefined);
        const sourceControl = await loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: lifecycle.loadPluginContributions });
        assert.equal(sourceControl.get("github")?.pluginId, githubEnabled ? "github" : undefined);
        if (githubEnabled) {
          const { createSourceControlProviderKit } = await import("../../../source-control/provider-kit.js");
          const provider = sourceControl.get("github")!.module.create({ kit: createSourceControlProviderKit({ httpClient: { send: async () => { throw new Error("unexpected HTTP call"); } } }) });
          assert.equal(typeof provider.commitFiles, "function");
          assert.equal(typeof provider.commitBackupTree, "function");
        }
        assert.deepEqual((await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins.github, githubBefore);
      });
    });
  }
}
