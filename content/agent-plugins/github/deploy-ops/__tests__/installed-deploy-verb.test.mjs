import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forceRemove } from "../../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/force-remove.ts";
import { resolveAgentPluginLayout } from "../../../../../apps/website/src/features/agent-plugins/layout.ts";
import { createTovuAgentPluginLifecycle, seedBundledAgentPlugins } from "../../../../../apps/website/src/features/agent-plugins/lifecycle.ts";
import { loadDeployOpsRegistry } from "../../../../../apps/website/src/features/deployments/deploy-ops/registry.ts";

/**
 * Moved from core deploy-ops/__tests__/installed-deploy-verb.test.ts.
 * The bundled github plugin (owner of the github-actions platform) is digest-trusted: editing a deploy-ops `.mjs` changes its digest. These
 * prove the boot seeder re-trusts the new digest, so the deploy verb actually loads after an upgrade.
 */
const CONTENT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKSPACE_ID = "workspace-local";

async function withAgentPluginsDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-ops-verb-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try { return await fn(resolveAgentPluginLayout()); }
  finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("seeded from this build, the installed github-actions adapter exports deploy", async () => {
  await withAgentPluginsDir(async layout => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const registry = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
    assert.deepEqual(registry.refusals, []);
    assert.equal(typeof registry.get("github-actions")?.module.deploy, "function");
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
      const loaded = registry.get("github-actions").module;
      assert.equal(loaded.nextBuild, true);
      assert.equal(typeof loaded.deploy, "function");
    });
  } finally { await forceRemove(sourceRoot); }
});
