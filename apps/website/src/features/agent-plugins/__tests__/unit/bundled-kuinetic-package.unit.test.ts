import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
 * @file Tovu's side of the `kuinetic` Agent Plugin (`@jini-ai/agent-plugins/kuinetic`, owner 2026-11-19):
 * the owner's own animation library ships as its own plugin, seeded on beside ui-ux-design, whose
 * Tovu overlay tells the agent to call `load_agent_plugin({ "pluginId": "kuinetic" })` first. Its guidance must reach the
 * automatic path whole rather than be deferred as oversized.
 */

const PLUGIN_ID = "kuinetic";
const PACKAGE_ROOT = agentPluginSourceDir({ pluginId: PLUGIN_ID });
const WORKSPACE_ID = "workspace-local";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");
/** Jini's MAX_AUTOMATIC_GUIDANCE_BYTES (`@jini-ai/agent-plugins` src/lifecycle/automatic-use.ts, not exported). */
const AUTOMATIC_GUIDANCE_LIMIT_BYTES = 8 * 1024;

let source: DisposableSourceRoot;
before(async () => { source = await selectedPluginSourceRoot({ pluginIds: [PLUGIN_ID] }); });
after(() => source.dispose());

test("kuinetic is a bundled plugin with a valid manifest on the seeded-enabled list", async () => {
  assert.equal(SELECTED_AGENT_PLUGIN_PACKAGES.get(PLUGIN_ID), "@jini-ai/agent-plugins/kuinetic");
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(PLUGIN_ID), true);
  const parsed = parseAgentPluginManifest({ value: JSON.parse(await readFile(path.join(PACKAGE_ROOT, "plugin.json"), "utf8")) });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, PLUGIN_ID);
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("kuinetic seeds on, registers agent_plugin_kuinetic, and its guidance fits the 8 KiB automatic limit", async (t) => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-kuinetic-seed-"));
  t.after(() => forceRemove(siteDir));
  const layout = resolveAgentPluginLayout({ siteDir }, { env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: source.root, hostOverlaysDir: path.join(REPO_ROOT, "content/agent-plugin-overlays") });
  const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: source.root });
  assert.equal(seeded.outcomes.find((item) => item.pluginId === PLUGIN_ID)?.status, "seeded");
  const workspace = layout.forWorkspace({ workspaceId: WORKSPACE_ID });
  assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot: workspace.root })).plugins[PLUGIN_ID]?.enabled, true);

  const sources = (await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE_ID, agentPluginLayout: layout }))
    .filter((item) => item.pluginId === PLUGIN_ID);
  assert.deepEqual(sources.map((item) => [item.id, item.defaultSkillName]), [["agent_plugin_kuinetic", PLUGIN_ID]]);

  const resolved = await lifecycle.resolveAgentPluginGuidance({ pluginRefIds: [PLUGIN_ID], workspaceLayout: workspace }, { deliveryMode: "inject", allowInactiveGuidance: true });
  assert.equal(resolved.ok, true);
  const guidance = resolved.ok ? resolved.promptPrefix : "";
  assert.ok(Buffer.byteLength(guidance) < AUTOMATIC_GUIDANCE_LIMIT_BYTES, `${Buffer.byteLength(guidance)} bytes`);
  assert.ok(guidance.includes(await readFile(path.join(PACKAGE_ROOT, "skills", PLUGIN_ID, "SKILL.md"), "utf8")));
});
