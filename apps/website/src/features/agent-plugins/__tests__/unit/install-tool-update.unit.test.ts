import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ToolInputError, createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { applyToolApprovalPolicy } from "#src/assistant/tool-approval-policy";
import { approvalClassAsks } from "../../../../contracts/headless/assistant-tool-approval-policy.js";
import { InMemoryExternalMcpServerRepo } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { toolMetadata } from "../../../../contracts/core/tool-metadata/agent-plugins.js";
import { AGENT_PLUGINS_UPDATE_TOOL_ID, buildRegistrations, catalog, derivedRisk } from "../../install-tool.js";
import { installUploadedAgentPlugin } from "../../install-upload.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { buildZipFixture } from "../fixtures/build-zip.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { agentPluginActivations } from "../../activation-effects.js";

/**
 * @file `agent_plugins_update` — the assistant's explicit Agent Plugin update. It reads the
 * candidate like the install tool (zip path, attachment or folder) and goes through the same
 * `installUploadedAgentPlugin({ update })` transaction as the admin Update button, with the host's
 * settings-snapshot owner and MCP effects. Unlike `agent_plugins_install` (which always lands OFF
 * and needs the always-ask `plugins_set_enabled`), an update keeps an enabled plugin enabled, so it
 * asks a human every time: otherwise an assistant could make an unverified package live alone.
 */

const WORKSPACE = "workspace-local";
const PLUGIN = "notes";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const context = (value: unknown) => ({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input: value, signal: new AbortController().signal });
const packageZip = (version: string, name = PLUGIN) =>
  buildZipFixture([{ path: "plugin.json", content: JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version }) }]);

function mcpDeps() {
  const keyring = new InMemoryKeyring();
  return { clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() }, externalMcpServerRepo: new InMemoryExternalMcpServerRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), siteAssistantSecretKeyring: keyring, notifyExternalMcpRosterChanged: async () => {} };
}

async function withInstalled<T>(fn: (env: { dir: string; layout: ReturnType<typeof resolveAgentPluginLayout>; oldDigest: string; archive: Buffer }) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-tool-update-"));
  // Every operation receives this layout explicitly; a fixture must not change another test's env.
  try {
    const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: dir } });
    const archive = await packageZip("1.0.0");
    const { plugin } = await installUploadedAgentPlugin({ archive, expectedSha256: sha(archive), workspaceId: WORKSPACE, actor: "owner" }, { layout });
    return await fn({ dir, layout, oldDigest: plugin.archiveDigest, archive });
  } finally {
    await forceRemove(dir);
  }
}

function updateTool(deps: Record<string, unknown>) {
  const registration = buildRegistrations(testSiteLayoutContext({ workspaceId: WORKSPACE, authorize: async () => ({ allowed: true, reason: "matched" }), ...deps }))
    .find((entry) => entry.descriptor.id === AGENT_PLUGINS_UPDATE_TOOL_ID);
  assert.ok(registration);
  return registration;
}

async function zipOnDisk(dir: string, version: string, name = PLUGIN): Promise<string> {
  const file = path.join(dir, `${name}-${version}.zip`);
  await writeFile(file, await packageZip(version, name));
  return file;
}

async function folderWithoutManifest(dir: string): Promise<string> {
  const folder = path.join(dir, "not-a-package");
  await mkdir(folder);
  await writeFile(path.join(folder, "README.md"), "no plugin.json here");
  return folder;
}

test("agent_plugins_update: catalog and risk match the install tool; approval always asks", () => {
  const update = catalog.find((entry) => entry.name === AGENT_PLUGINS_UPDATE_TOOL_ID);
  assert.ok(update);
  assert.equal(update.authorization?.permission, "admin.plugins.enable");
  assert.equal(update.sideEffects, "mutates-durable-state");
  assert.deepEqual((update.inputSchema as { required: string[] }).required, ["source", "pluginId", "expectedOldDigest"]);
  assert.match(update.description, /plugins_list/);
  assert.equal(derivedRisk.get(AGENT_PLUGINS_UPDATE_TOOL_ID), "mutates-durable-state");
  assert.deepEqual(toolMetadata.agent_plugins_update.approval, { class: "escalation", confirmation: "policy" });
  assert.equal(approvalClassAsks(toolMetadata.agent_plugins_update.approval), true);
});

test("agent_plugins_update: without a human confirmation an enabled plugin is not updated", async () => {
  await withInstalled(async ({ dir, layout, oldDigest }) => {
    const workspaceRoot = layout.forWorkspace(WORKSPACE).root;
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN, enabled: true, actor: "owner" });
    const zip = path.join(dir, "notes-2.0.0.zip");
    await writeFile(zip, await packageZip("2.0.0"));
    const registry = createToolRegistry({});
    registry.register(applyToolApprovalPolicy({ registration: updateTool({ agentPluginLayout: layout, ...mcpDeps(), snapshotAgentPluginSettings: async () => ({ keys: [] }) }), surfaces: {} as never }));
    const result = await createToolExecutor({ registry }).execute({ toolId: AGENT_PLUGINS_UPDATE_TOOL_ID, principal: { id: "owner" }, run: { id: "run" },
      input: { source: { kind: "zip", path: zip }, pluginId: PLUGIN, expectedOldDigest: oldDigest } });
    assert.equal(result.status, "failed");
    const after = await installUploadedAgentPlugin({ archive: await packageZip("1.0.0"), expectedSha256: oldDigest, workspaceId: WORKSPACE, actor: "owner" }, { layout });
    assert.equal(after.alreadyInstalled, true, "the installed bytes are still the 1.0.0 package");
  });
});

test("agent_plugins_update: a newer zip updates the plugin, keeps it enabled, and snapshots settings through the host owner", async () => {
  await withInstalled(async ({ dir, layout, oldDigest }) => {
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE).root, pluginId: PLUGIN, enabled: true, actor: "owner" });
    const snapshots: unknown[] = [];
    const tool = updateTool({ agentPluginLayout: layout, ...mcpDeps(), snapshotAgentPluginSettings: async (scope: unknown) => { snapshots.push(scope); return { keys: [] }; } });
    const result = await tool.handler(context({ source: { kind: "zip", path: await zipOnDisk(dir, "1.1.0") }, pluginId: PLUGIN, expectedOldDigest: oldDigest }), {}) as Record<string, unknown>;
    assert.equal(result.updated, true);
    assert.equal(result.alreadyInstalled, false);
    assert.equal(result.enabled, true);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.plugin, { id: PLUGIN, version: "1.1.0" });
    assert.equal(result.warning, "Trust: local / unverified publisher. Uploaded Agent Plugin code is not trusted to run. Skills can guide the assistant.",
      "the install trust warning, without 'stays OFF': this plugin stays enabled");
    assert.match(String(result.note), /Memory is kept/);
    assert.deepEqual(snapshots, [{ workspaceId: WORKSPACE, pluginId: PLUGIN }]);
  });
});

test("agent_plugins_update: the installed bytes again report nothing changed", async () => {
  await withInstalled(async ({ dir, layout, oldDigest, archive }) => {
    const tool = updateTool({ agentPluginLayout: layout, ...mcpDeps(), snapshotAgentPluginSettings: async () => ({ keys: [] }) });
    // Reuse the installed bytes: rebuilding a ZIP reads the wall clock for entry timestamps,
    // so even the same manifest can acquire a different digest when a batch crosses a second.
    const file = path.join(dir, "installed-again.zip");
    await writeFile(file, archive);
    assert.equal(sha(archive), oldDigest);
    const result = await tool.handler(context({ source: { kind: "zip", path: file }, pluginId: PLUGIN, expectedOldDigest: oldDigest }), {}) as Record<string, unknown>;
    assert.equal(result.updated, false);
    assert.equal(result.alreadyInstalled, true);
    assert.deepEqual(result.plugin, { id: PLUGIN, version: "1.0.0" });
    assert.match(String(result.note), /already installed; nothing changed/);
  });
});

test("agent_plugins_update: lifecycle refusals reach the model as input errors carrying the code", async () => {
  await withInstalled(async ({ dir, layout, oldDigest }) => {
    const tool = updateTool({ agentPluginLayout: layout, ...mcpDeps(), snapshotAgentPluginSettings: async () => ({ keys: [] }) });
    const cases: Array<[RegExp, Record<string, unknown>]> = [
      [/^PLUGIN_CHANGED: /, { source: { kind: "zip", path: await zipOnDisk(dir, "1.1.0") }, pluginId: PLUGIN, expectedOldDigest: "c".repeat(64) }],
      [/^PLUGIN_ID_MISMATCH: /, { source: { kind: "zip", path: await zipOnDisk(dir, "1.1.0", "other") }, pluginId: PLUGIN, expectedOldDigest: oldDigest }],
      [/^MANIFEST_MISSING: /, { source: { kind: "folder", path: await folderWithoutManifest(dir) }, pluginId: PLUGIN, expectedOldDigest: oldDigest }],
    ];
    for (const [message, input] of cases) {
      await assert.rejects(() => tool.handler(context(input), {}), (error: unknown) => error instanceof ToolInputError && message.test(error.message));
    }
  });
});

test("agent_plugins_update: malformed targets are input errors before any file is read", async () => {
  let reads = 0;
  const tool = updateTool({ agentPluginLayout: resolveAgentPluginLayout(), readInstallAttachment: async () => { reads++; return { ok: false as const, refusal: "not-owner" as const }; } });
  const source = { kind: "zip", attachmentRef: "attachment:agent123" };
  for (const input of [
    { source, pluginId: "Bad_Id", expectedOldDigest: "a".repeat(64) },
    { source, pluginId: PLUGIN, expectedOldDigest: "A".repeat(64) },
    { source, expectedOldDigest: "a".repeat(64) },
    { source, pluginId: PLUGIN },
  ]) {
    await assert.rejects(() => tool.handler(context(input), {}), ToolInputError, JSON.stringify(input));
  }
  assert.equal(reads, 0);
});

test("agent_plugins_update: a bundled source kind is refused like any non-archive source", async () => {
  const tool = updateTool({ agentPluginLayout: resolveAgentPluginLayout(), ...mcpDeps(), snapshotAgentPluginSettings: async () => ({ keys: [] }) });
  await assert.rejects(() => tool.handler(context({ source: { kind: "bundled", bundledId: PLUGIN }, pluginId: PLUGIN, expectedOldDigest: "a".repeat(64) }), {}),
    (error: unknown) => error instanceof ToolInputError && /source.kind must be 'folder' or 'zip'/.test(error.message));
});

test("agent_plugins_update: a host without MCP effects or a settings snapshot owner fails as a wiring error, changing nothing", async () => {
  await withInstalled(async ({ dir, layout, oldDigest }) => {
    const input = { source: { kind: "zip", path: await zipOnDisk(dir, "1.1.0") }, pluginId: PLUGIN, expectedOldDigest: oldDigest };
    await assert.rejects(() => updateTool({ agentPluginLayout: layout, snapshotAgentPluginSettings: async () => ({ keys: [] }) }).handler(context(input), {}),
      (error: unknown) => !(error instanceof ToolInputError) && /did not bind its MCP provisioning/.test((error as Error).message));
    await assert.rejects(() => updateTool({ agentPluginLayout: layout, ...mcpDeps() }).handler(context(input), {}),
      (error: unknown) => !(error instanceof ToolInputError) && /did not bind the plugin settings snapshot owner/.test((error as Error).message));
    const record = JSON.parse(JSON.stringify(await agentPluginActivations.readAgentPluginActivations({ workspaceRoot: layout.forWorkspace(WORKSPACE).root }))).plugins[PLUGIN];
    assert.equal(record.enabled, false);
  });
});

test("agent_plugins_update: permission is checked before the target", async () => {
  const registration = buildRegistrations(testSiteLayoutContext({ workspaceId: WORKSPACE, authorize: async () => ({ allowed: false, reason: "insufficient_permission" }) }))
    .find((entry) => entry.descriptor.id === AGENT_PLUGINS_UPDATE_TOOL_ID)!;
  await assert.rejects(() => registration.handler(context({ pluginId: "Bad_Id" }), {}), (error: unknown) => !(error instanceof ToolInputError));
});

test("agent_plugins_update: a version-less package updates through the host's identity admission and reports no version", async () => {
  await withInstalled(async ({ dir, layout, oldDigest }) => {
    const file = path.join(dir, "notes-unversioned.zip");
    await writeFile(file, await buildZipFixture([{ path: "plugin.json", content: JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN, description: "unversioned" }) }]));
    const candidates: unknown[] = [];
    const pluginHost = { async withInstallIdentity({ candidate, run }: { candidate: unknown; run: () => Promise<unknown> }) { candidates.push(candidate); return run(); }, getHostCapability: () => undefined };
    const tool = updateTool({ agentPluginLayout: layout, ...mcpDeps(), pluginHost, snapshotAgentPluginSettings: async () => ({ keys: [] }) });
    const result = await tool.handler(context({ source: { kind: "zip", path: file }, pluginId: PLUGIN, expectedOldDigest: oldDigest }), {}) as Record<string, unknown>;
    assert.equal(result.updated, true);
    assert.deepEqual(result.plugin, { id: PLUGIN });
    assert.ok(candidates.length >= 1);
    assert.ok(candidates.every(candidate => (candidate as { family: string }).family === "agent-plugin"));
  });
});
