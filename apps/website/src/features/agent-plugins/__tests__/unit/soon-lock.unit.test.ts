import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import { readTemplate } from "#src/platform/site-dir/index";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createTovuAgentPluginLifecycle, explicitRootAgentPluginActivations } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { setAgentPluginEnabled } from "../../set-enabled.js";
import { loadAgentPluginSearchCandidates } from "../../tool-registrations.js";
import { AgentPluginNotReadyError, lockSoonAgentPlugins, readHostPluginMaturity, SOON_LOCK_ACTOR, type SoonCatalogPort } from "../../soon-lock.js";
import { restoreImportedPluginState } from "../../../site-backup/import-plugin-state.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file "Soon" plugins are locked off (owner, 2026-11-10): every enable path refuses in plain words, a
 * provider face never follows its provider on, a backup import writes them off, boot switches existing
 * ones off, and "untested" stays usable. Driven against a real temp agent-plugins root.
 */

const WORKSPACE = "workspace-local";
const NOT_READY = /^Notes isn't ready yet, so it can't be turned on\. You can still view its files\.$/;

type Fixture = { pluginId?: string; displayName?: string; maturity?: "untested" | "soon"; providerPlugin?: string };

/** A plugin manifest carrying Tovu's metadata under Jini's portable `extensions.jini` key. */
async function writePluginSource(dir: string, { pluginId = "notes", displayName = "Notes", maturity, providerPlugin }: Fixture = {}): Promise<void> {
  await mkdir(path.join(dir, "skills", pluginId), { recursive: true });
  await writeFile(path.join(dir, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0",
    description: "Keeps notes.", extensions: { jini: { displayName, ...(maturity ? { maturity } : {}), ...(providerPlugin ? { providerPlugin } : {}) } } }));
  await writeFile(path.join(dir, "skills", pluginId, "SKILL.md"), `---\nname: ${pluginId}\ndescription: Take notes.\n---\nWrite things down.`);
}

async function installed(t: TestContext, fixture: Fixture = {}) {
  const pluginId = fixture.pluginId ?? "notes";
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-soon-lock-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  });
  const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() });
  const source = path.join(dir, "source", pluginId);
  await writePluginSource(source, fixture);
  const packed = await lifecycle.packAgentPluginDirectory(source);
  await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  const workspaceRoot = layout.forWorkspace(WORKSPACE).root;
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId, enabled: false, actor: "owner" });
  const isActive = async () => (await explicitRootAgentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId })).verdict === "active";
  return { layout, lifecycle, workspaceRoot, isActive };
}

test("the admin switch, plugins_set_enabled and connect defaults refuse to turn a Soon plugin on, in plain words, and write nothing; off always works", async t => {
  const { layout, isActive } = await installed(t, { maturity: "soon" });
  await assert.rejects(setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: true, actor: "owner" }),
    (error: unknown) => error instanceof AgentPluginNotReadyError && NOT_READY.test(error.message) && error.code === "AGENT_PLUGIN_NOT_READY");
  assert.equal(await isActive(), false);
  // A sign-in's connect defaults take the same switch with the conditional write.
  await assert.rejects(setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: true, actor: "system:connect" }, { unlessOperatorDisabled: true }), AgentPluginNotReadyError);
  assert.equal(await isActive(), false);
  assert.equal((await setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: false, actor: "owner" })).enabled, false);
});

test("a Soon provider face says it isn't ready, not that its provider's switch decides", async t => {
  const { layout, isActive } = await installed(t, { maturity: "soon", providerPlugin: "analytics-notes" });
  await assert.rejects(setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: true, actor: "owner" }),
    (error: unknown) => error instanceof AgentPluginNotReadyError && NOT_READY.test(error.message));
  assert.equal(await isActive(), false);
});

test("the provider-face mirror never turns a Soon plugin on", async t => {
  const { workspaceRoot, isActive } = await installed(t, { maturity: "soon" });
  assert.equal(await explicitRootAgentPluginActivations.reconcileAgentPluginActivation({ workspaceRoot, pluginId: "notes", resolveEnabled: async () => true, actor: "system:provider-plugin" }), false);
  assert.equal(await isActive(), false);
});

test("an untested plugin is only a warning: it still switches on", async t => {
  const { layout, isActive } = await installed(t, { maturity: "untested" });
  assert.equal((await setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "notes", enabled: true, actor: "owner" })).enabled, true);
  assert.equal(await isActive(), true);
});

test("Tovu's host list marks the faces Jini ships without a flag as Soon; a manifest flag still wins", () => {
  for (const pluginId of ["posthog", "opentelemetry", "stripe", "sentry", "google-forms"]) assert.equal(readHostPluginMaturity({ manifest: {}, pluginId }), "soon");
  assert.equal(readHostPluginMaturity({ manifest: {}, pluginId: "github" }), undefined);
  assert.equal(readHostPluginMaturity({ manifest: { extensions: { jini: { maturity: "untested" } } }, pluginId: "github" }), "untested");
  assert.equal(readHostPluginMaturity({ manifest: { extensions: { jini: { maturity: "untested" } } }, pluginId: "posthog" }), "untested");
});

test("a host-listed plugin with no flag is refused, and the admin listing shows it as Soon", async t => {
  const { layout } = await installed(t, { pluginId: "posthog", displayName: "PostHog" });
  await assert.rejects(setAgentPluginEnabled({ agentPluginLayout: layout, workspaceId: WORKSPACE, pluginId: "posthog", enabled: true, actor: "owner" }),
    (error: unknown) => error instanceof AgentPluginNotReadyError && error.message === "PostHog isn't ready yet, so it can't be turned on. You can still view its files.");
  const candidates = await loadAgentPluginSearchCandidates({ workspaceId: WORKSPACE, agentPluginLayout: layout });
  assert.equal(candidates.find(candidate => candidate.pluginId === "posthog")?.maturity, "soon");
});

test("a backup import writes a Soon plugin off and carries the rest, without aborting", async t => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "tovu-soon-import-"));
  t.after(() => forceRemove(siteDir));
  const sourceRoot = path.join(siteDir, "bundled");
  await writePluginSource(path.join(sourceRoot, "notes"), { maturity: "soon" });
  await writePluginSource(path.join(sourceRoot, "plain"), { pluginId: "plain", displayName: "Plain" });
  const layout = resolveAgentPluginLayout({ siteDir }, { env: {} });
  const archived = (id: string) => ({ kind: "agent" as const, id, version: "1.0.0", digest: "0".repeat(64), enabled: true, shipped: true });
  const stage = path.join(siteDir, "stage");
  await mkdir(stage, { recursive: true });
  await restoreImportedPluginState({ root: stage, dir: siteDir, layout, files: [],
    state: { plugins: [archived("notes"), archived("plain")], trustedPlugins: [], modified: [] } }, { sourceRoot });
  const workspaceRoot = layout.forWorkspace(readTemplate({ templateId: "starter" }).seed.workspace.id).root;
  const verdict = async (pluginId: string) => (await explicitRootAgentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId })).verdict;
  assert.equal(await verdict("notes"), "inactive");
  assert.equal(await verdict("plain"), "active");
});

test("boot switches off every Soon plugin that is on, as system:soon-lock, and leaves the rest", async () => {
  const manifests: Record<string, unknown> = { notes: { extensions: { jini: { maturity: "soon" } } }, posthog: {}, github: {}, quiet: { extensions: { jini: { maturity: "soon" } } } };
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
