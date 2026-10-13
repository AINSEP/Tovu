import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { resolveAgentPluginLayout } from "../../../agent-plugins/layout.js";
import { seedBundledAgentPlugins } from "../../../agent-plugins/lifecycle.js";
import { loadDeployOpsRegistry } from "../registry.js";

/**
 * The bundled github plugin (owner of the github-actions platform) is digest-trusted: editing a deploy-ops `.mjs` changes its digest. These
 * prove the boot seeder re-trusts the new digest, so the deploy verb actually loads after an upgrade.
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

test("seeded from this build, the installed github-actions adapter exports deploy and fly stays observe-only", async () => {
  await withAgentPluginsDir(async layout => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const registry = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
    assert.deepEqual(registry.refusals, []);
    assert.equal(typeof registry.get("github-actions")?.module.deploy, "function");
    assert.equal(registry.get("fly")?.module.deploy, undefined);
  });
});

test("upgrade: a site holding the previous github digest loads the changed adapter after the next boot", async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "tovu-deploy-ops-source-"));
  try {
    await cp(path.join(CONTENT_ROOT, "github"), path.join(sourceRoot, "github"), { recursive: true });
    await withAgentPluginsDir(async layout => {
      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
      const modulePath = path.join(sourceRoot, "github", "deploy-ops", "github-actions.mjs");
      const source = await readFile(modulePath, "utf8");
      await writeFile(modulePath, source.replace("export default { status, logs, deploy };", "export default { status, logs, deploy, nextBuild: true };"));
      const lifecycle = createTovuAgentPluginLifecycle({ layout });
      const packed = await lifecycle.packAgentPluginDirectory(path.join(sourceRoot, "github"));
      const installed = await lifecycle.installAgentPlugin({ layout, workspaceId: WORKSPACE_ID, archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader() });
      const beforeReseed = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: lifecycle.loadPluginContributions });
      assert.deepEqual(beforeReseed.list(), []);
      assert.deepEqual(beforeReseed.refusals, [`deploy ops from 'github' were not loaded: only plugins shipped with Tovu may add deploy ops (installed digest ${installed.archiveDigest.slice(0, 12)} is not the one this build shipped)`]);
      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
      assert.equal((await readdir(layout.forWorkspace(WORKSPACE_ID).pluginPackagesDir({ pluginId: "github" }))).length, 1, "successful publication prunes the superseded digest");
      const registry = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
      assert.deepEqual(registry.refusals, []);
      const loaded = registry.get("github-actions")!.module as unknown as { nextBuild?: boolean; deploy?: unknown };
      assert.equal(loaded.nextBuild, true);
      assert.equal(typeof loaded.deploy, "function");
    });
  } finally { await forceRemove(sourceRoot); }
});

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
