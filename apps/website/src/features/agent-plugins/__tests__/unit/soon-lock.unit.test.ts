import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createTovuAgentPluginLifecycle, explicitRootAgentPluginActivations } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { readPluginMaturity } from "../../identity.js";
import { setAgentPluginEnabled } from "../../set-enabled.js";
import { AgentPluginNotReadyError, lockSoonAgentPlugins, SOON_LOCK_ACTOR, type SoonCatalogPort } from "../../soon-lock.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file "Soon" plugins are locked off (owner, 2026-11-10): every enable path of the activation owner
 * refuses in plain words, a provider face never follows its provider on, boot switches existing ones
 * off, and "untested" stays usable. Driven against a real temp agent-plugins root.
 */

const WORKSPACE = "workspace-local";
const NOT_READY = /^Notes isn't ready yet, so it can't be turned on\. You can still view its files\.$/;

async function installed(t: TestContext, maturity?: "untested" | "soon") {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-soon-lock-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  });
  const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() });
  const source = path.join(dir, "source", "notes");
  await mkdir(path.join(source, "skills", "notes"), { recursive: true });
  await writeFile(path.join(source, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "notes", version: "1.0.0", description: "Keeps notes.", extensions: { tovu: { displayName: "Notes", ...(maturity ? { maturity } : {}) } } }));
  await writeFile(path.join(source, "skills", "notes", "SKILL.md"), "---\nname: notes\ndescription: Take notes.\n---\nWrite things down.");
  const packed = await lifecycle.packAgentPluginDirectory(source);
  await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  const workspaceRoot = layout.forWorkspace(WORKSPACE).root;
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: "notes", enabled: false, actor: "owner" });
  const isActive = async () => (await explicitRootAgentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId: "notes" })).verdict === "active";
  return { layout, lifecycle, workspaceRoot, isActive };
}

test("the admin switch and plugins_set_enabled refuse to turn a Soon plugin on, in plain words, and write nothing", async t => {
  const { layout, isActive } = await installed(t, "soon");
  await assert.rejects(setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: true, actor: "owner" }),
    (error: unknown) => error instanceof AgentPluginNotReadyError && NOT_READY.test(error.message) && error.code === "AGENT_PLUGIN_NOT_READY");
  assert.equal(await isActive(), false);
  // A sign-in's connect defaults take the same switch with the conditional write.
  await assert.rejects(setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: true, actor: "system:connect" }, { unlessOperatorDisabled: true }), AgentPluginNotReadyError);
  assert.equal((await setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: false, actor: "owner" })).enabled, false);
});

test("the raw activation writer and the provider-face mirror cannot turn a Soon plugin on either", async t => {
  const { workspaceRoot, isActive } = await installed(t, "soon");
  await assert.rejects(explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: "notes", enabled: true, actor: "system:import" }), AgentPluginNotReadyError);
  assert.equal(await explicitRootAgentPluginActivations.reconcileAgentPluginActivation({ workspaceRoot, pluginId: "notes", resolveEnabled: async () => true, actor: "system:provider-plugin" }), false);
  assert.equal(await isActive(), false);
});

test("an untested plugin is only a warning: it still switches on", async t => {
  const { layout, isActive } = await installed(t, "untested");
  assert.equal((await setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: true, actor: "owner" })).enabled, true);
  assert.equal(await isActive(), true);
});

test("Tovu's host list marks the faces Jini ships without a flag as Soon; others keep the manifest's answer", () => {
  for (const pluginId of ["posthog", "opentelemetry", "stripe", "sentry", "google-forms"]) assert.equal(readPluginMaturity({ manifest: {}, pluginId }), "soon");
  assert.equal(readPluginMaturity({ manifest: {}, pluginId: "github" }), undefined);
  assert.equal(readPluginMaturity({ manifest: { extensions: { tovu: { maturity: "untested" } } }, pluginId: "github" }), "untested");
});

test("boot switches off every Soon plugin that is on, as system:soon-lock, and leaves the rest", async () => {
  const manifests: Record<string, unknown> = { notes: { extensions: { tovu: { maturity: "soon" } } }, posthog: {}, github: {}, quiet: { extensions: { tovu: { maturity: "soon" } } } };
  const catalog: SoonCatalogPort = { list: async () => Object.keys(manifests).map(pluginId => ({ pluginId })), readManifest: async ({ plugin }) => JSON.stringify(manifests[plugin.pluginId]) };
  const writes: unknown[] = [];
  const switched = await lockSoonAgentPlugins({ catalog, workspaceRoot: "/ws", activations: {
    resolveAgentPluginActivation: async ({ pluginId }) => ({ verdict: pluginId === "quiet" ? "inactive" : "active" }),
    setAgentPluginActivation: async required => { writes.push(required); },
  } });
  assert.deepEqual(switched, ["notes", "posthog"]);
  assert.deepEqual(writes, [
    { workspaceRoot: "/ws", pluginId: "notes", enabled: false, actor: SOON_LOCK_ACTOR },
    { workspaceRoot: "/ws", pluginId: "posthog", enabled: false, actor: SOON_LOCK_ACTOR },
  ]);
});
