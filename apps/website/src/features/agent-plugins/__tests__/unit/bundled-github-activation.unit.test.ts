import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";
import { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } from "../../activation.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";
import { buildSourceControlProvider, buildSourceControlProviders } from "#src/features/source-control/provider-registry";

/**
 * @file The bundled `github` plugin hosts the only git-host provider (site commit, write-files, site
 * backup, the Source Control form's account-name probe). Those paths predate the plugin, so an
 * existing site must keep them after upgrade with no user action: the seeder's own untouched
 * disabled record is switched on at boot, and an operator's own "off" is kept — with a refusal that
 * says exactly where to switch it back on.
 */

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const WORKSPACE_ID = "workspace-local";

/** Runs `fn` against a temp agent-plugins dir, restoring the env and removing the frozen tree after. */
async function withAgentPluginsDir<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-github-plugin-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout());
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("existing site: the seeder's own earlier DISABLED github record is switched on at boot, so commit and backup still work", async () => {
  await withAgentPluginsDir(async (layout) => {
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    // What every workspace seeded before this change carries: the seeder's untouched disabled record.
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: "github" });
    assert.equal((await readAgentPluginActivations(workspaceRoot)).plugins.github?.enabled, false);

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations(workspaceRoot)).plugins.github?.enabled, true);

    // The exact resolution source_control_execute_commit makes.
    const commit = await buildSourceControlProvider({ workspaceId: WORKSPACE_ID, providerId: "github" });
    assert.equal(commit.ok, true, commit.ok ? "" : commit.message);
    assert.equal(commit.ok && typeof commit.provider.commitSite, "function");

    // The exact resolution site_backup_* makes.
    const backup = await buildSourceControlProviders({ workspaceId: WORKSPACE_ID, httpClient: { send: async () => { throw new Error("no network in this test"); } } });
    assert.deepEqual(backup.refusals, []);
    assert.deepEqual(backup.providers.map((provider) => provider.apiOrigin), ["https://api.github.com"]);
    assert.equal(typeof backup.providers[0]?.uploadBackupBlob, "function");
  });
});

test("fresh site: github seeds ENABLED with no user action", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations(layout.forWorkspace(WORKSPACE_ID).root)).plugins.github?.enabled, true);
  });
});

test("an operator who switched github off stays off across boots, and a commit is refused with how to switch it back on", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "github", enabled: false, actor: "test:operator" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations(workspaceRoot)).plugins.github?.enabled, false);

    const commit = await buildSourceControlProvider({ workspaceId: WORKSPACE_ID, providerId: "github" });
    assert.equal(commit.ok, false);
    assert.equal(
      commit.ok ? "" : commit.message,
      "No enabled Agent Plugin provides 'github' source control: the 'github' Agent Plugin is switched off. To switch it back on, open the admin's Add-Ons > Agent Plugins screen and turn on 'github'.",
    );

    // What site_backup_* refuses with (NO_PROVIDER) when no host is left at all.
    const backup = await buildSourceControlProviders({ workspaceId: WORKSPACE_ID, httpClient: { send: async () => { throw new Error("no network in this test"); } } });
    assert.deepEqual(backup.providers, []);
    assert.equal(
      backup.noProviderMessage,
      "No enabled Agent Plugin provides source control: the 'github' Agent Plugin is switched off. To switch it back on, open the admin's Add-Ons > Agent Plugins screen and turn on 'github'.",
    );
  });
});
