import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
import { agentPluginSourceDir } from "../../../../../../../development/test-support/agent-plugin-source.mjs";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } from "../../bundled-catalog.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { createTovuAgentPluginLifecycle } from "../../lifecycle.js";
import { registerInstalledAgentPluginTools, loadInstalledAgentPluginToolSources } from "../../tool-registrations.js";
import { selectedPluginSourceRoot } from "../fixtures/bundled-source-root.js";
import { forceRemove } from "../fixtures/force-remove.js";

const PLUGIN_ID = "software-engineering";
const WORKSPACE = "workspace-local";
const PACKAGE_ROOT = agentPluginSourceDir({ pluginId: PLUGIN_ID });
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");
const overlayRoot = path.join(REPO_ROOT, "content/agent-plugin-overlays");
const readSkill = () => readFile(path.join(PACKAGE_ROOT, "skills/software-engineering/SKILL.md"), "utf8");

/** Real selected bytes pass through Tovu's lifecycle, activation gate and two delivery paths. */
test("software-engineering seeds OFF, explicit enablement delivers its skill/overlay, and revocation survives reboots", async t => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-engineering-seed-"));
  const source = await selectedPluginSourceRoot({ pluginIds: [PLUGIN_ID] });
  t.after(async () => { await source.dispose(); await forceRemove(siteDir); });
  const manifest = JSON.parse(await readFile(path.join(PACKAGE_ROOT, "plugin.json"), "utf8"));
  assert.equal(parseAgentPluginManifest({ value: manifest }).ok, true);
  assert.equal(manifest.extensions.tovu.displayName, "Tovu Software Engineering");
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(PLUGIN_ID), false);
  const layout = resolveAgentPluginLayout({ siteDir }, { env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: source.root, hostOverlaysDir: overlayRoot });
  const workspace = layout.forWorkspace(WORKSPACE);
  const input = { layout, workspaceId: WORKSPACE, sourceRoot: source.root };
  const seeded = await lifecycle.seedBundledAgentPlugins(input);
  assert.equal(seeded.ledgerFailure, undefined);
  assert.equal(seeded.outcomes.find(item => item.pluginId === PLUGIN_ID)?.status, "seeded");
  assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot: workspace.root })).plugins[PLUGIN_ID]?.enabled, false);
  assert.deepEqual(await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE, agentPluginLayout: layout }), []);
  assert.equal((await lifecycle.resolveAgentPluginRefs([PLUGIN_ID], workspace, "inject")).ok, false);

  await lifecycle.setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId: PLUGIN_ID, enabled: true, actor: "test:operator" });
  const sources = await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE, agentPluginLayout: layout });
  assert.deepEqual(sources.map(item => item.id), ["agent_plugin_software_engineering"]);
  const registry = createToolRegistry({});
  await registerInstalledAgentPluginTools(registry,
    { workspaceId: WORKSPACE, agentPluginLayout: layout, withExtensionApprovalPolicy }, { overlaysDir: overlayRoot });
  const executor = createToolExecutor({ registry });
  const request = { principal: { id: "test:operator" }, run: { id: "run-engineering" }, toolId: "agent_plugin_software_engineering", input: {} };
  const completed = await executor.execute(request);
  assert.equal(completed.status, "completed");
  const tool = completed.output as { guidance: string; files: string[] };
  const overlay = await readFile(path.join(overlayRoot, PLUGIN_ID, "GUIDANCE.md"), "utf8");
  assert.equal(tool.guidance, `${overlay}\n\n${await readSkill()}`);
  assert.deepEqual(tool.files, ["references/debugging.md", "references/implementation.md", "references/planning.md", "references/verification.md"]);
  const injected = await lifecycle.resolveAgentPluginRefs([PLUGIN_ID], workspace, "inject");
  assert.equal(injected.ok, true);
  if (!injected.ok) throw new Error(injected.reason);
  assert.ok(injected.promptPrefix.includes(overlay));
  assert.ok(injected.promptPrefix.includes(await readSkill()));
  const pointer = await lifecycle.resolveAgentPluginRefs([PLUGIN_ID], workspace, "pointer");
  assert.equal(pointer.ok, true);
  if (!pointer.ok) throw new Error(pointer.reason);
  assert.match(pointer.promptPrefix, /agent_plugin_software_engineering/);
  assert.equal(pointer.promptPrefix.includes(overlay), false, "pointer defers guidance until the gated tool call");

  await lifecycle.setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId: PLUGIN_ID, enabled: false, actor: "test:operator" });
  await lifecycle.seedBundledAgentPlugins(input);
  assert.equal((await lifecycle.readAgentPluginActivations({ workspaceRoot: workspace.root })).plugins[PLUGIN_ID]?.enabled, false);
  assert.deepEqual(await loadInstalledAgentPluginToolSources({ workspaceId: WORKSPACE, agentPluginLayout: layout }), []);
  assert.equal((await lifecycle.resolveAgentPluginRefs([PLUGIN_ID], workspace, "inject")).ok, false);
  const denied = await executor.execute(request);
  assert.equal(denied.status, "denied");
  assert.equal(denied.output, undefined, "a held tool registration cannot deliver guidance after revocation");
});

test("staged upstream skill tree is byte-identical and the host overlay stays within its budget", async () => {
  for (const file of ["SKILL.md", "references/debugging.md", "references/implementation.md", "references/planning.md", "references/verification.md"]) {
    assert.equal(await readFile(path.join(REPO_ROOT, "cloud/ads-ainsep-skill/software-engineering", file), "utf8"),
      await readFile(path.join(PACKAGE_ROOT, "skills/software-engineering", file), "utf8"), file);
  }
  const overlay = await readFile(path.join(overlayRoot, PLUGIN_ID, "GUIDANCE.md"), "utf8");
  assert.ok(Buffer.byteLength(overlay) <= 2048);
  assert.match(overlay, /Never use Bash, curl, npx or package installers from chat/);
  assert.match(overlay, /UNVERIFIED/);
  assert.match(overlay, /authorized coding environment/);
});
