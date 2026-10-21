/** The agent install tool's update operation, its error mapping, and the result-shape edges the
 * install/sources suites do not reach. Real layout and upload service on a temp dir; only the host
 * owners an update needs (settings snapshot, MCP store) are fakes, and they hold no plugin servers. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { buildRegistrations, contributeAgentPluginsInstallTools, type AgentPluginsInstallToolDeps } from "../../install-tool.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { agentPluginActivations } from "../../activation-effects.js";
import { listInstalledPlugins } from "../../lifecycle.js";
import { buildZipFixture } from "../fixtures/build-zip.js";
import { forceRemove } from "../fixtures/force-remove.js";

const context = (input: unknown) => ({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input, signal: new AbortController().signal });
const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

function manifestZip(manifest: Record<string, unknown>) {
  return buildZipFixture([{ path: "plugin.json", content: JSON.stringify({ $schema: SCHEMA, ...manifest }) }]);
}

async function fixture(t: TestContext, extra: Partial<AgentPluginsInstallToolDeps> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "agent-install-update-"));
  t.after(() => forceRemove(root));
  const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "installed") } });
  const snapshots: unknown[] = [];
  const deps = { workspaceId: "workspace-local", authorize: async () => ({ allowed: true as const, reason: "matched" as const }), agentPluginLayout: layout,
    snapshotAgentPluginSettings: async (required: { workspaceId: string; pluginId: string }) => { snapshots.push(required); return {}; },
    clock: { nowMs: () => 0, nowIso: () => "2026-10-21T00:00:00.000Z" }, externalMcpServerRepo: {}, siteAssistantSecretSealer: {}, siteAssistantSecretKeyring: {},
    ...extra } as unknown as AgentPluginsInstallToolDeps;
  const tools = buildRegistrations(deps);
  const tool = (id: string) => tools.find(candidate => candidate.descriptor.id === id)!;
  const zipAt = async (name: string, manifest: Record<string, unknown>) => {
    const bytes = await manifestZip(manifest);
    const file = path.join(root, name);
    await writeFile(file, bytes);
    return { file, digest: createHash("sha256").update(bytes).digest("hex") };
  };
  return { root, layout, deps, snapshots, install: tool("agent_plugins_install"), update: tool("agent_plugins_update"), zipAt,
    workspaceRoot: layout.forWorkspace("workspace-local").root };
}

test("update replaces a disabled operator install, keeps it OFF, snapshots settings first and reports the new version", async t => {
  const f = await fixture(t);
  const v1 = await f.zipAt("v1.zip", { name: "update-me", version: "1.0.0" });
  await f.install.handler(context({ source: { kind: "zip", path: v1.file } }), {});
  const v2 = await f.zipAt("v2.zip", { name: "update-me", version: "2.0.0" });
  const result = await f.update.handler(context({ source: { kind: "zip", path: v2.file }, pluginId: "update-me", expectedOldDigest: v1.digest }), {});
  assert.deepEqual(result, { updated: true, enabled: false, warnings: [], plugin: { id: "update-me", version: "2.0.0" },
    note: "Memory is kept. Rollback restores package bytes, not state written by the candidate. Running chats retain captured guidance; in-flight MCP calls may fail." });
  assert.deepEqual(f.snapshots, [{ workspaceId: "workspace-local", pluginId: "update-me" }]);
});

test("update refuses a malformed digest before reading anything", async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.update.handler(context({ source: { kind: "zip", path: "/nowhere.zip" }, pluginId: "x", expectedOldDigest: "abc" }), {}),
    (error: unknown) => error instanceof ToolInputError && error.message === "expectedOldDigest must be a SHA-256 digest.");
});

test("update without the host MCP owner is refused as unavailable, unchanged by the error mapping", async t => {
  const f = await fixture(t, { clock: undefined });
  const v2 = await f.zipAt("v2.zip", { name: "update-me", version: "2.0.0" });
  await assert.rejects(() => f.update.handler(context({ source: { kind: "zip", path: v2.file }, pluginId: "update-me", expectedOldDigest: "a".repeat(64) }), {}),
    (error: unknown) => error instanceof ToolInputError && error.message === "Plugin update MCP effects are unavailable.");
});

test("lifecycle update refusals reach the model as coded input errors", async t => {
  const unbound = await fixture(t, { snapshotAgentPluginSettings: undefined });
  const v2 = await unbound.zipAt("v2.zip", { name: "update-me", version: "2.0.0" });
  await assert.rejects(() => unbound.update.handler(context({ source: { kind: "zip", path: v2.file }, pluginId: "update-me", expectedOldDigest: "a".repeat(64) }), {}),
    (error: unknown) => error instanceof ToolInputError && /^UPDATE_SETTINGS_OWNER_UNBOUND: /.test(error.message));
});

test("an enabled plugin whose candidate needs a newer host is refused as host-incompatible, and stays installed", async t => {
  const f = await fixture(t);
  const v1 = await f.zipAt("v1.zip", { name: "update-me", version: "1.0.0" });
  await f.install.handler(context({ source: { kind: "zip", path: v1.file } }), {});
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: f.workspaceRoot, pluginId: "update-me", enabled: true, actor: "owner" });
  const v2 = await f.zipAt("v2.zip", { name: "update-me", version: "2.0.0", extensions: { tovu: { hostRange: ">=999.0.0" } } });
  await assert.rejects(() => f.update.handler(context({ source: { kind: "zip", path: v2.file }, pluginId: "update-me", expectedOldDigest: v1.digest }), {}),
    (error: unknown) => error instanceof ToolInputError && /^PLUGIN_HOST_INCOMPATIBLE: /.test(error.message));
  assert.deepEqual((await listInstalledPlugins(f.workspaceRoot)).map(plugin => [plugin.pluginId, plugin.version]), [["update-me", "1.0.0"]]);
});

test("an unexpected failure is rethrown unchanged, not dressed as an input error", async t => {
  const failure = new Error("attachment store offline");
  const f = await fixture(t, { readInstallAttachment: async () => { throw failure; } });
  await assert.rejects(() => f.install.handler(context({ source: { kind: "zip", attachmentRef: "attachment:00000000-0000-4000-8000-000000000001" } }), {}), (error: unknown) => error === failure);
});

test("a versionless package installs without a version field", async t => {
  const f = await fixture(t);
  const zip = await f.zipAt("plain.zip", { name: "no-version" });
  const result = await f.install.handler(context({ source: { kind: "zip", path: zip.file } }), {}) as { plugin: Record<string, unknown> };
  assert.deepEqual(result.plugin, { id: "no-version" });
});

test("the contributor builds the same tools with the composed attachment reader", async t => {
  const f = await fixture(t);
  const reads: string[] = [];
  const bytes = await manifestZip({ name: "from-chat", version: "1.0.0" });
  const contributor = contributeAgentPluginsInstallTools({ readInstallAttachment: async ({ ref }) => { reads.push(ref); return { ok: true, bytes }; } });
  assert.equal(contributor.domain, "agent-plugins-install");
  const install = contributor.build(f.deps as never, {} as never).find(tool => tool.descriptor.id === "agent_plugins_install")!;
  const result = await install.handler(context({ source: { kind: "zip", attachmentRef: "attachment:00000000-0000-4000-8000-000000000002" } }), {}) as { installed: boolean };
  assert.equal(result.installed, true);
  assert.deepEqual(reads, ["attachment:00000000-0000-4000-8000-000000000002"]);
  assert.equal(contributeAgentPluginsInstallTools().domain, "agent-plugins-install");
});

test("a bundled package the boot seeder leaves OFF reports Installed OFF; the default source root is the shipped one", async t => {
  const f = await fixture(t);
  const sourceRoot = path.join(f.root, "bundled");
  await mkdir(path.join(sourceRoot, "off-by-default"), { recursive: true });
  await writeFile(path.join(sourceRoot, "off-by-default", "plugin.json"), JSON.stringify({ $schema: SCHEMA, name: "off-by-default", version: "1.0.0" }));
  const [install] = buildRegistrations({ ...f.deps, bundledAgentPluginsSourceRoot: sourceRoot });
  const result = await install!.handler(context({ source: { kind: "bundled", bundledId: "off-by-default" } }), {}) as { enabled: boolean; note: string };
  assert.equal(result.enabled, false);
  assert.equal(result.note, "Installed OFF. Enable with plugins_set_enabled (family 'agent-plugin') if requested.");
  const [shipped] = buildRegistrations({ ...f.deps, bundledAgentPluginsSourceRoot: undefined });
  await assert.rejects(() => shipped!.handler(context({ source: { kind: "bundled", bundledId: "not-shipped-anywhere" } }), {}), /Unknown bundled plugin id 'not-shipped-anywhere'/);
});

test("a replacement reports the version it upgraded from, and installs under the host's install identity", async t => {
  const admitted: unknown[] = [];
  const pluginHost = { withInstallIdentity: async ({ candidate, run }: { candidate: unknown; run: () => Promise<unknown> }) => { admitted.push(candidate); return run(); } };
  const f = await fixture(t, { pluginHost } as unknown as Partial<AgentPluginsInstallToolDeps>);
  const v1 = await f.zipAt("v1.zip", { name: "replace-me", version: "1.0.0" });
  await f.install.handler(context({ source: { kind: "zip", path: v1.file } }), {});
  const v2 = await f.zipAt("v2.zip", { name: "replace-me", version: "2.0.0" });
  const result = await f.install.handler(context({ source: { kind: "zip", path: v2.file }, replace: true }), {}) as { plugin: Record<string, unknown> };
  assert.deepEqual(result.plugin, { id: "replace-me", version: "2.0.0", upgradeFrom: ["1.0.0"] });
  assert.equal(admitted.length, 2);
  const { localId, family } = admitted[1] as { localId: string; family: string };
  assert.deepEqual({ localId, family }, { localId: "replace-me", family: "agent-plugin" });
});
