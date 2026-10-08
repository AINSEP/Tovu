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
 * The bundled deploy plugin is digest-trusted: editing a deploy-ops `.mjs` changes its digest. These
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
    const registry = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(registry.refusals, []);
    assert.equal(typeof registry.get("github-actions")?.module.deploy, "function");
    assert.equal(registry.get("fly")?.module.deploy, undefined);
  });
});

test("upgrade: a site holding the previous deploy digest loads the changed adapter after the next boot", async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "tovu-deploy-ops-source-"));
  try {
    await cp(path.join(CONTENT_ROOT, "deploy"), path.join(sourceRoot, "deploy"), { recursive: true });
    await withAgentPluginsDir(async layout => {
      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
      const modulePath = path.join(sourceRoot, "deploy", "deploy-ops", "github-actions.mjs");
      const source = await readFile(modulePath, "utf8");
      await writeFile(modulePath, source.replace("export default { status, logs, deploy };", "export default { status, logs, deploy, nextBuild: true };"));
      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
      assert.equal((await readdir(layout.forWorkspace(WORKSPACE_ID).pluginPackagesDir({ pluginId: "deploy" }))).length, 2, "the superseded digest stays on disk; the ledger must pick the new one");
      const registry = await loadDeployOpsRegistry({ workspaceId: WORKSPACE_ID });
      assert.deepEqual(registry.refusals, []);
      const loaded = registry.get("github-actions")!.module as unknown as { nextBuild?: boolean; deploy?: unknown };
      assert.equal(loaded.nextBuild, true);
      assert.equal(typeof loaded.deploy, "function");
    });
  } finally { await forceRemove(sourceRoot); }
});
