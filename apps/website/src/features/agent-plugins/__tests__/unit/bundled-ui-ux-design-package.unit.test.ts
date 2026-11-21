import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { agentPluginSourceDir } from "../../../../../../../development/test-support/agent-plugin-source.mjs";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, SELECTED_AGENT_PLUGIN_PACKAGES } from "../../bundled-catalog.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { createTovuAgentPluginLifecycle } from "../../lifecycle.js";
import { loadInstalledAgentPluginToolSources } from "../../tool-registrations.js";
import { selectedPluginSourceRoot, type DisposableSourceRoot } from "../fixtures/bundled-source-root.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file Tovu's side of the shared `ui-ux-design` Agent Plugin, which ships as
 * `@jini-ai/agent-plugins/ui-ux-design` and is read here from that selected package: the manifest
 * parses under this host, it is seeded on, its six skills reach the real registration path, and its
 * automatically delivered guidance (Tovu overlay + core SKILL.md + file list) fits Jini's 8 KiB limit.
 * The skill-text pins run with the plugin in Jini (`packages/agent-plugins/ui-ux-design/__tests__`);
 * Tovu's chat rules run on the overlay (`content/agent-plugin-overlays/ui-ux-design/__tests__`).
 */

const PLUGIN_ID = "ui-ux-design";
const PACKAGE_ROOT = agentPluginSourceDir({ pluginId: PLUGIN_ID });
const WORKSPACE_ID = "workspace-local";
const EXPECTED_SKILLS = ["frontend-accessibility", "gstack-design", "interface-design", "ui-ux-design", "vercel-web-design-guidelines", "web-compliance"];
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");
const OVERLAY_ROOT = path.join(REPO_ROOT, "content/agent-plugin-overlays");
/** Jini's MAX_AUTOMATIC_GUIDANCE_BYTES (`@jini-ai/agent-plugins` src/lifecycle/automatic-use.ts, not exported):
 * guidance above it is deferred to a pointer instead of reaching the first turn. */
const AUTOMATIC_GUIDANCE_LIMIT_BYTES = 8 * 1024;

let source: DisposableSourceRoot;
before(async () => { source = await selectedPluginSourceRoot({ pluginIds: [PLUGIN_ID] }); });
after(() => source.dispose());

test("bundled ui-ux-design has a valid manifest and is on the seeded-enabled list", async () => {
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readFile(path.join(PACKAGE_ROOT, "plugin.json"), "utf8")) });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, PLUGIN_ID);
  assert.equal(parsed.ok && parsed.manifest.version, "0.7.0");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(PLUGIN_ID), true);
});

// 2026-11-19: a redesign built a theme without the design guidance because the whole bundle was
// deferred as over the automatic limit. The automatic path must deliver the core, overlay first.
test("ui-ux-design guidance reaches the automatic path whole: overlay and core under the 8 KiB limit", async (t) => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-design-size-"));
  t.after(() => forceRemove(siteDir));
  const layout = resolveAgentPluginLayout({ siteDir }, { env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: source.root, hostOverlaysDir: OVERLAY_ROOT });
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
  const workspace = layout.forWorkspace({ workspaceId: WORKSPACE_ID });
  const resolved = await lifecycle.resolveAgentPluginGuidance({ pluginRefIds: [PLUGIN_ID], workspaceLayout: workspace }, { deliveryMode: "inject", allowInactiveGuidance: true });
  assert.equal(resolved.ok, true);
  const guidance = resolved.ok ? resolved.promptPrefix : "";
  assert.ok(Buffer.byteLength(guidance) < AUTOMATIC_GUIDANCE_LIMIT_BYTES, `${Buffer.byteLength(guidance)} bytes`);
  assert.ok(guidance.includes(await readFile(path.join(OVERLAY_ROOT, PLUGIN_ID, "GUIDANCE.md"), "utf8")), "the automatic guidance includes the complete Tovu overlay");
  assert.ok(guidance.includes(await readFile(path.join(PACKAGE_ROOT, "skills", PLUGIN_ID, "SKILL.md"), "utf8")), "the automatic guidance includes the complete design skill");
  assert.match(guidance, /`load_agent_plugin\(\{ "pluginId": "kuinetic" \}\)` first/);
});

test("shadcn-ui is its own bundled plugin, selected but not seeded on", () => {
  assert.equal(SELECTED_AGENT_PLUGIN_PACKAGES.get("shadcn-ui"), "@jini-ai/agent-plugins/shadcn-ui");
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("shadcn-ui"), false);
  assert.equal(EXPECTED_SKILLS.includes("shadcn-ui"), false);
});

for (const initial of ["new site", "untouched disabled seed", "operator disabled"] as const) {
  test(`ui-ux-design seeds correctly for ${initial}`, async (t) => {
    const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-design-seed-"));
    t.after(() => forceRemove(siteDir));
    const layout = resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} });
    const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: source.root });
    const workspaceRoot = layout.forWorkspace({ workspaceId: WORKSPACE_ID }).root;
    if (initial === "untouched disabled seed") {
      await lifecycle.recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: PLUGIN_ID });
      assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN_ID]?.enabled, false);
    }
    if (initial === "operator disabled") {
      await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: false, actor: "test:operator" });
    }

    const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
    const outcome = seeded.outcomes.find((item) => item.pluginId === PLUGIN_ID);
    assert.ok(outcome && outcome.status === "seeded");
    assert.equal(seeded.ledgerFailure, undefined);
    const installed = (await lifecycle.listInstalledPlugins({ workspaceRoot })).filter((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.deepEqual(installed.map((plugin) => plugin.version), ["0.7.0"]);
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

// Bundled seeding never prunes a same-name revision (Jini A1, 2026-11-02): the manual install's
// digest stays on disk, and the seeded digest is the one selected — one tool, across boots.
test("ui-ux-design seeding selects its bundled revision over a manual install, keeps the manual digest, and stays singular across boots", async (t) => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-design-manual-"));
  t.after(() => forceRemove(siteDir));
  const layout = resolveAgentPluginLayout({ siteDir: siteDir }, { env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: source.root });
  const workspaceRoot = layout.forWorkspace({ workspaceId: WORKSPACE_ID }).root;
  const manualSource = path.join(siteDir, "manual-source");
  await cp(PACKAGE_ROOT, manualSource, { recursive: true });
  const manifestPath = path.join(manualSource, "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, version: "0.0.1" })}\n`);
  const packed = await lifecycle.packAgentPluginDirectory({ sourceDir: manualSource });
  const manual = await lifecycle.installAgentPlugin({
    archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(),
    layout, workspaceId: WORKSPACE_ID,
  });
  await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });

  for (let boot = 0; boot < 2; boot += 1) {
    const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
    const outcome = seeded.outcomes.find((item) => item.pluginId === PLUGIN_ID);
    assert.ok(outcome && outcome.status === "seeded");
    assert.equal(seeded.ledgerFailure, undefined);
    assert.notEqual(outcome.archiveDigest, manual.archiveDigest);
    const installed = (await lifecycle.listInstalledPlugins({ workspaceRoot })).filter((plugin) => plugin.pluginId === PLUGIN_ID);
    assert.deepEqual(installed.map((plugin) => plugin.archiveDigest).sort(), [outcome.archiveDigest, manual.archiveDigest].sort());
    const sources = (await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID, agentPluginLayout: layout }))
      .filter((source) => source.pluginId === PLUGIN_ID);
    assert.equal(sources.length, 1);
    assert.equal(sources[0]!.id, "agent_plugin_ui_ux_design");
    assert.equal(sources[0]!.archiveDigest, outcome.archiveDigest);
    assert.equal(sources[0]!.skills.find((skill) => skill.name === PLUGIN_ID)?.markdown,
      await readFile(path.join(PACKAGE_ROOT, "skills", PLUGIN_ID, "SKILL.md"), "utf8"));
    const record = (await lifecycle.readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN_ID];
    assert.equal(record?.enabled, true);
    assert.equal(record?.updatedBy, "test:operator");
  }
});
