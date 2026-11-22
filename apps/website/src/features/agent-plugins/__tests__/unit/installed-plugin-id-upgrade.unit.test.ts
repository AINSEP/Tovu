/**
 * @file PLUGIN-ID-UPGRADE failing proof (r62t-rsy-7 "PARTIAL · Installed plugin ID upgrade"; owner
 * decision: a maintenance step with verified bundled replacements, third-party revisions go to a
 * publisher list). The trusted pre-rename bundle is the published `@jini-ai/agent-plugins@0.7.2`
 * (`latest`, registry integrity sha512-3awhB0LhIfm2YZrfjX1AIl9XLhisW1MvgiOerWHkFXuC2ybDMiTs0VVzpV6wXSWi9zI0P8BWTEdJcryYIu+t2g==).
 * `fixtures/pre-rename-0.7.2/cloudflare` is that tarball's `cloudflare/` folder byte for byte
 * (`tovu/cloudflare` 0.3.3); the canonical bundle ships `jini/cloudflare` 0.3.4. Red until the
 * maintenance step existed (`bundled-id-upgrade.ts`): an installed site must reach the qualified ID
 * with its owner state kept, and anything unverified must stay where it is.
 */
import assert from "node:assert/strict";
import { appendFile, chmod, cp, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createTovuAgentPluginLifecycle, explicitRootAgentPluginActivations } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { selectedPluginSourceRoot } from "../fixtures/bundled-source-root.js";

const WORKSPACE = "workspace-local";
const PRE_RENAME_ROOT = path.join(import.meta.dirname, "../fixtures/pre-rename-0.7.2");

async function boundLifecycle(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-plugin-id-upgrade-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  });
  const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  return { layout, lifecycle: createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() }) };
}

test("a site installed from the pre-rename 0.7.2 bundle reaches jini/cloudflare with its owner activation kept, and a second run is stable", async t => {
  const { layout, lifecycle } = await boundLifecycle(t);
  const workspaceRoot = layout.forWorkspace({ workspaceId: WORKSPACE }).root;
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot: PRE_RENAME_ROOT });
  const before = (await lifecycle.listInstalledPlugins({ workspaceRoot })).find(plugin => plugin.pluginId === "cloudflare");
  assert.equal(before?.id, "tovu/cloudflare", "fixture: the published 0.7.2 bundle installs the pre-rename identity");
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: "cloudflare", enabled: true, actor: "owner" });

  const canonical = await selectedPluginSourceRoot({ pluginIds: ["cloudflare"] });
  t.after(() => canonical.dispose());
  for (const run of ["first", "second"]) {
    await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot: canonical.root });
    const after = (await lifecycle.listInstalledPlugins({ workspaceRoot })).find(plugin => plugin.pluginId === "cloudflare");
    assert.equal(after?.id, "jini/cloudflare", `${run} upgrade run: the installed revision carries the canonical qualified ID`);
    const activation = await explicitRootAgentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId: "cloudflare" });
    assert.notEqual(activation.verdict, "inactive", `${run} upgrade run: the owner's short-name activation survives the upgrade`);
  }
});

/** A pre-rename source root the test may edit: the 0.7.2 fixture copied to a throwaway folder. */
async function editablePreRenameRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-pre-rename-copy-"));
  t.after(() => forceRemove(root));
  await cp(PRE_RENAME_ROOT, root, { recursive: true });
  return root;
}

/** Installs `sourceRoot`'s cloudflare as a site would have it, then seeds the canonical bundle once. */
async function seedOverInstalled(t: TestContext, { sourceRoot, beforeUpgrade }: { sourceRoot: string; beforeUpgrade?: (plugin: { packageRoot: string; workspaceRoot: string }) => Promise<void> }) {
  const { layout, lifecycle } = await boundLifecycle(t);
  const workspaceRoot = layout.forWorkspace({ workspaceId: WORKSPACE }).root;
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot });
  const before = (await lifecycle.listInstalledPlugins({ workspaceRoot })).find(plugin => plugin.pluginId === "cloudflare");
  assert.ok(before, "fixture: the pre-rename copy is installed");
  await beforeUpgrade?.({ packageRoot: before.packageRoot, workspaceRoot });
  const canonical = await selectedPluginSourceRoot({ pluginIds: ["cloudflare"] });
  t.after(() => canonical.dispose());
  const result = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot: canonical.root });
  const after = (await lifecycle.listInstalledPlugins({ workspaceRoot })).filter(plugin => plugin.pluginId === "cloudflare");
  return { before, after, result, workspaceRoot };
}

test("the upgrade keeps the plugin's data and memory and saves the moved pre-rename copy", async t => {
  const { before, after, result, workspaceRoot } = await seedOverInstalled(t, { sourceRoot: PRE_RENAME_ROOT,
    beforeUpgrade: async ({ workspaceRoot: root }) => {
      await writeFile(path.join(root, "cloudflare", "data", "owner-setting.json"), "{\"kept\":true}");
      await writeFile(path.join(root, "cloudflare", "memory", "notes", "owner.md"), "kept note");
    } });
  assert.deepEqual(after.map(plugin => plugin.id), ["jini/cloudflare"]);
  assert.equal(await readFile(path.join(workspaceRoot, "cloudflare", "data", "owner-setting.json"), "utf8"), "{\"kept\":true}");
  assert.equal(await readFile(path.join(workspaceRoot, "cloudflare", "memory", "notes", "owner.md"), "utf8"), "kept note");
  const upgrade = result.idUpgrades?.find(outcome => outcome.pluginId === "cloudflare");
  assert.equal(upgrade?.status, "upgraded");
  assert.ok(upgrade?.status === "upgraded" && (await stat(path.join(upgrade.moved[0]!.savedAt, "plugin.json"))).isFile(), "the moved copy is saved, not deleted");
  assert.equal(upgrade.moved[0]!.packageRoot, before.packageRoot);
});

test("a pre-rename copy whose files were edited after install stays in place and is reported in plain words", async t => {
  const { after, result } = await seedOverInstalled(t, { sourceRoot: PRE_RENAME_ROOT, beforeUpgrade: async ({ packageRoot }) => {
    const notes = path.join(packageRoot, "NOTES.md");
    await chmod(notes, 0o644);
    await appendFile(notes, "\nlocal edit\n");
  } });
  assert.deepEqual(after.map(plugin => plugin.id), ["tovu/cloudflare"], "the edited copy is never moved");
  assert.deepEqual(result.idUpgrades, [{ status: "held", pluginId: "cloudflare", to: "jini/cloudflare", reason: "its installed files were changed after install" }]);
});

test("an unrelated publisher's revision in the same slot stays in place and is named for the publisher list", async t => {
  const sourceRoot = await editablePreRenameRoot(t);
  const manifestPath = path.join(sourceRoot, "cloudflare", "plugin.json");
  await writeFile(manifestPath, (await readFile(manifestPath, "utf8")).replace("\"tovu/cloudflare\"", "\"acme/cloudflare\""));
  const { after, result } = await seedOverInstalled(t, { sourceRoot });
  assert.deepEqual(after.map(plugin => plugin.id), ["acme/cloudflare"], "a third-party revision is never moved");
  assert.deepEqual(result.idUpgrades, [{ status: "held", pluginId: "cloudflare", to: "jini/cloudflare", reason: "its installed copy is published as 'acme/cloudflare', not 'tovu/cloudflare'" }]);
});
