import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { recordBundledAgentPluginDigests } from "../../features/agent-plugins/lifecycle.js";
import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createApplyConnectDefaults } from "../../features/agent-plugins/apply-connect-defaults.js";
import * as federation from "../../features/agent-plugins/federate-mcp.js";
import { resolveAgentPluginLayout } from "../../features/agent-plugins/layout.js";
import { parseAgentPluginMcpConfig, type McpServerConfig } from "../../features/agent-plugins/mcp-metadata.js";
import { createStoredExternalMcpConnectionSource } from "../external-mcp-connection-source.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { readEnabledExternalMcpConfigs, saveExternalMcpServer } from "../external-mcp-store.js";

const url = "https://mcp.example.com/mcp";
const workspaceId = "workspace";
const pluginId = "read-plugin";
async function harness() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse("2026-10-01T12:00:00.000Z"), nowIso: () => "2026-10-01T12:00:00.000Z" };
  const deps = { repo, keyring, sealer, clock };
  await saveExternalMcpServer(deps, { workspaceId, serverId: "remote", label: "Remote", transport: "streamable_http", authMode: "none",
    enabled: true, url, command: "", args: "", allowedToolNames: "inspect", writeAllowedToolNames: "", principalId: "owner", provisionedByPluginId: pluginId });
  await saveExternalMcpServer(deps, { workspaceId, serverId: "url-only", label: "URL only", transport: "streamable_http", authMode: "none",
    enabled: true, url, command: "", args: "", allowedToolNames: "inspect", writeAllowedToolNames: "", principalId: "owner" });
  return { ...deps };
}
function servers(read: string[]): Readonly<Record<string, McpServerConfig>> {
  const parsed = parseAgentPluginMcpConfig({ value: { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { remote: { type: "streamable-http", url } } } },
    { pluginManifest: { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, extensions: { tovu: { mcpServers: { remote: { tovuDefaultTools: { read } } } } } } });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("invalid fixture");
  const remote = parsed.config.servers.remote;
  assert.ok(remote && remote.type !== "stdio", "the fixture must declare a remote server");
  assert.deepEqual(remote.tovuDefaultTools?.read, read, "the fixture must contain a valid read declaration");
  return parsed.config.servers;
}

test("stored config preserves plugin provenance for roster resolution", async () => {
  const deps = await harness();
  const result = await readEnabledExternalMcpConfigs(deps, workspaceId);
  assert.deepEqual(result.failures, []);
  assert.equal(result.configs.find((c) => c.serverId === "remote")?.provisionedByPluginId, pluginId);
});

test("read defaults match both normalized server identity and exact URL, never only URL", () => {
  assert.equal(typeof federation.findAgentPluginMcpServerDefaults, "function", "shared endpoint-matching rule must be exported");
  const declared = servers(["inspect"]);
  assert.deepEqual(federation.findAgentPluginMcpServerDefaults(declared, { serverId: "remote", url })?.read, ["inspect"]);
  assert.equal(federation.findAgentPluginMcpServerDefaults(declared, { serverId: "remote", url: "https://changed.example/mcp" }), null);
  assert.equal(federation.findAgentPluginMcpServerDefaults(declared, { serverId: "other", url }), null);
});

test("each roster read loads the current manifest; URL-only servers never receive read metadata", async () => {
  const deps = await harness();
  let read = ["inspect"];
  const calls: unknown[] = [];
  const source = createStoredExternalMcpConnectionSource({ ...deps, workspaceId, log: "[t05]",
    resolvePluginReadOnlyRemoteNames: async (input) => {
      calls.push(input);
      return new Set(federation.findAgentPluginMcpServerDefaults(servers(read), input)?.read ?? []);
    },
  });
  const first = await source.resolve();
  assert.deepEqual([...first.find((c) => c.config.connectionId === "remote")!.config.readOnlyRemoteNames!], ["inspect"]);
  assert.equal(first.find((c) => c.config.connectionId === "url-only")!.config.readOnlyRemoteNames, undefined);
  assert.deepEqual(calls, [{ workspaceId, pluginId, serverId: "remote", url }]);
  read = [];
  const next = await source.resolve();
  assert.deepEqual([...next.find((c) => c.config.connectionId === "remote")!.config.readOnlyRemoteNames!], []);
});

test("plugin resolution failure grants no read metadata and preserves the unrelated roster", async (t) => {
  t.mock.method(console, "warn", () => {});
  const deps = await harness();
  const source = createStoredExternalMcpConnectionSource({ ...deps, workspaceId, log: "[t05]",
    resolvePluginReadOnlyRemoteNames: async () => { throw new Error("manifest unavailable"); },
  });
  const result = await source.resolve();
  assert.deepEqual(result.map((c) => c.config.connectionId).sort(), ["remote", "url-only"]);
  assert.deepEqual(result.map((c) => c.config.readOnlyRemoteNames), [undefined, undefined]);
});

test("a read-only manifest does not enable the plugin or change grants on first sign-in", async () => {
  const deps = await harness();
  const existing = await deps.repo.findByServerId({ workspaceId, serverId: "remote" });
  assert.ok(existing);
  await deps.repo.upsert({ ...existing, enabled: false, allowedToolNames: "[]", writeAllowedToolNames: "[]" });
  const before = await deps.repo.findByServerId({ workspaceId, serverId: "remote" });
  const effects: string[] = [];
  const apply = createApplyConnectDefaults({ ...deps, workspaceId, resolveServers: async () => servers(["inspect"]),
    enablePlugin: async () => { effects.push("enable"); }, notifyRosterChanged: async () => { effects.push("notify"); } });
  await apply("remote");
  assert.deepEqual(await deps.repo.findByServerId({ workspaceId, serverId: "remote" }), before);
  assert.deepEqual(effects, []);
});


test("real manifest resolver grants only a build-seeded plugin at the exact endpoint", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-t05-read-list-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = root;
  try {
    // Paths come from the product layout so the fixture installs where the resolver reads
    // (Layout B moved packages to <workspace>/<pluginId>/package/sha256 in 852d711e6).
    const workspaceLayout = resolveAgentPluginLayout().forWorkspace(workspaceId);
    const workspaceRoot = workspaceLayout.root;
    const digest = "a".repeat(64);
    const packageRoot = path.join(workspaceLayout.pluginPackagesDir({ pluginId }), digest);
    await mkdir(packageRoot, { recursive: true });
    await writeFile(path.join(packageRoot, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, extensions: { tovu: { mcpServers: { remote: { tovuDefaultTools: { read: ["inspect"] } } } } } }));
    await writeFile(path.join(packageRoot, "mcp.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { remote: { type: "streamable-http", url } } }));
    const input = { workspaceId, pluginId, serverId: "remote", url };
    assert.deepEqual([...await federation.resolveAgentPluginReadOnlyRemoteNames(input)], [], "an arbitrary installed plugin is not an operator-reviewed bundled declaration");
    await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: digest }], now: () => new Date("2026-10-01T12:00:00.000Z") });
    assert.deepEqual([...await federation.resolveAgentPluginReadOnlyRemoteNames(input)], ["inspect"]);
    assert.deepEqual([...await federation.resolveAgentPluginReadOnlyRemoteNames({ ...input, url: "https://changed.example/mcp" })], []);
    assert.deepEqual([...await federation.resolveAgentPluginReadOnlyRemoteNames({ ...input, serverId: "other" })], []);
    await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: "b".repeat(64) }], now: () => new Date("2026-10-01T12:00:00.000Z") });
    assert.deepEqual([...await federation.resolveAgentPluginReadOnlyRemoteNames(input)], [], "a stale or missing bundled digest must not trust a different installed package");
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
