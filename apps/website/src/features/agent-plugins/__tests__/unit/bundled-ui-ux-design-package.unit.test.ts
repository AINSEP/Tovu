import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } from "../../bundled-catalog.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { createTovuAgentPluginLifecycle } from "../../lifecycle.js";
import { loadInstalledAgentPluginToolSources } from "../../tool-registrations.js";
import { forceRemove } from "../fixtures/force-remove.js";

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PLUGIN_ID = "ui-ux-design";
const WORKSPACE_ID = "workspace-local";
const EXPECTED_SKILLS = ["frontend-accessibility", "gstack-design", "interface-design", "shadcn-ui", "ui-ux-design", "vercel-web-design-guidelines", "web-compliance"];

test("bundled ui-ux-design has a valid manifest and is on the seeded-enabled list", async () => {
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readFile(path.join(CONTENT_ROOT, PLUGIN_ID, "plugin.json"), "utf8")) });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, PLUGIN_ID);
  assert.equal(parsed.ok && parsed.manifest.version, "0.4.6");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(PLUGIN_ID), true);
});

for (const initial of ["new site", "untouched disabled seed", "operator disabled"] as const) {
  test(`ui-ux-design seeds correctly for ${initial}`, async (t) => {
    const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-design-seed-"));
    t.after(() => forceRemove(siteDir));
    const layout = resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} });
    const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() });
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    if (initial === "untouched disabled seed") {
      await lifecycle.recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: PLUGIN_ID });
      assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN_ID]?.enabled, false);
    }
    if (initial === "operator disabled") {
      await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: false, actor: "test:operator" });
    }

    const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const outcome = seeded.outcomes.find((item) => item.pluginId === PLUGIN_ID);
    assert.ok(outcome && outcome.status === "seeded");
    assert.equal(seeded.ledgerFailure, undefined);
    const installed = (await lifecycle.listInstalledPlugins(workspaceRoot)).filter((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.deepEqual(installed.map((plugin) => plugin.version), ["0.4.6"]);
    const enabled = initial !== "operator disabled";
    const record = (await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN_ID];
    assert.equal(record?.enabled, enabled);
    assert.equal(record?.updatedBy, enabled ? "system:seed" : "test:operator");

    // Prove the prose's exact loader id and skill against the real registration path.
    const sources = (await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID, agentPluginLayout: layout }))
      .filter((source) => source.pluginId === PLUGIN_ID);
    if (enabled) {
      assert.equal(sources.length, 1);
      assert.equal(sources[0]!.id, "agent_plugin_ui_ux_design");
      assert.equal(sources[0]!.defaultSkillName, PLUGIN_ID);
      assert.deepEqual(sources[0]!.skills.map((skill) => skill.name).sort(), EXPECTED_SKILLS);
      assert.equal(sources[0]!.archiveDigest, outcome.archiveDigest);
    } else {
      assert.deepEqual(sources, []);
    }
  });
}

test("ui-ux-design seeding supersedes a manual install with different version/digest and stays singular across boots", async (t) => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-design-manual-"));
  t.after(() => forceRemove(siteDir));
  const layout = resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() });
  const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
  const manualSource = path.join(siteDir, "manual-source");
  await cp(path.join(CONTENT_ROOT, PLUGIN_ID), manualSource, { recursive: true });
  const manifestPath = path.join(manualSource, "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, version: "0.0.1" })}\n`);
  const packed = await lifecycle.packAgentPluginDirectory(manualSource);
  const manual = await lifecycle.installAgentPlugin({
    archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(),
    layout, workspaceId: WORKSPACE_ID,
  });
  await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });

  for (let boot = 0; boot < 2; boot += 1) {
    const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const outcome = seeded.outcomes.find((item) => item.pluginId === PLUGIN_ID);
    assert.ok(outcome && outcome.status === "seeded");
    assert.equal(seeded.ledgerFailure, undefined);
    assert.notEqual(outcome.archiveDigest, manual.archiveDigest);
    const installed = (await lifecycle.listInstalledPlugins(workspaceRoot)).filter((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.deepEqual(installed.map((plugin) => plugin.archiveDigest), [outcome.archiveDigest]);
    const sources = (await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID, agentPluginLayout: layout }))
      .filter((source) => source.pluginId === PLUGIN_ID);
    assert.equal(sources.length, 1);
    assert.equal(sources[0]!.id, "agent_plugin_ui_ux_design");
    assert.equal(sources[0]!.archiveDigest, outcome.archiveDigest);
    assert.equal(sources[0]!.skills.find((skill) => skill.name === PLUGIN_ID)?.markdown,
      await readFile(path.join(CONTENT_ROOT, PLUGIN_ID, "skills", PLUGIN_ID, "SKILL.md"), "utf8"));
    const record = (await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN_ID];
    assert.equal(record?.enabled, true);
    assert.equal(record?.updatedBy, "test:operator");
  }
});
