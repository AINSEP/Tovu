import { resolveSiteRoot } from "#src/platform/site-dir/index";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ACTIVATIONS_LOCK_FILENAME } from "@jini-ai/agent-plugins/lifecycle";

import { InMemoryExternalMcpServerRepo } from "../../../external-mcp/external-mcp-store.memory.js";
import { saveExternalMcpServer } from "../../../external-mcp/external-mcp-store.js";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";


import { resolveAgentPluginLayout } from "../../layout.js";
import { createBundledSourceArchiveReader, installAgentPlugin, packAgentPluginDirectory, seedBundledAgentPlugins } from "../../lifecycle.js";
import { AGENT_PLUGINS_SCREEN, describeSavedTokenSwitch, EXTERNAL_MCP_SCREEN, switchOnSavedTokenConnection } from "../../switch-on-saved-token.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file `switchOnSavedTokenConnection` reports "on" only when BOTH the connection row and the plugin's
 * own activation are on. A row an operator already set up (tools chosen, enabled) is skipped by
 * connect defaults, so the plugin's activation has to be switched on here — the seeder's default
 * "off" is not an operator decision, an operator's own "off" is. Real activations file in a temp
 * dir; the row store is in memory.
 */

const WORKSPACE = "ws-switch-on";
const PLUGIN = "some-plugin";

async function withAgentPluginsDir(fn: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-switch-on-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    await fn(resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }).forWorkspace(WORKSPACE).root);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

/** Installs a minimal PLUGIN package: switching a plugin on requires it to be installed here. */
async function installPlugin(): Promise<void> {
  const source = await mkdtemp(path.join(tmpdir(), "tovu-switch-on-src-"));
  try {
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN, version: "1.0.0" }));
    const packed = await packAgentPluginDirectory(source);
    await installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: createBundledSourceArchiveReader(), layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }), workspaceId: WORKSPACE });
  } finally {
    await forceRemove(source);
  }
}

/** An operator-configured, enabled row: connect defaults leave it alone. */
async function operatorEnabledRow() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const clock = { nowMs: () => Date.parse("2026-09-29T00:00:00.000Z"), nowIso: () => "2026-09-29T00:00:00.000Z" };
  await saveExternalMcpServer(
    { repo, sealer: new AesGcmSecretSealer(keyring), keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: "remote",
      transport: "streamable_http",
      authMode: "none",
      enabled: true,
      command: "",
      url: "https://mcp.example.com/mcp",
      args: "",
      allowedToolNames: "search",
      writeAllowedToolNames: "",
      principalId: "owner",
      provisionedByPluginId: PLUGIN,
    },
  );
  return { workspaceId: WORKSPACE, agentPluginLayout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }), mcp: { repo }, clock, notifyRosterChanged: async () => {}, onConnected: async () => {} };
}

test("the seeder's default 'off' is switched on with the row, and only then reported on", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    await installPlugin();
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: PLUGIN });
    const outcome = await switchOnSavedTokenConnection(await operatorEnabledRow(), { pluginId: PLUGIN, connectionId: "remote" });
    assert.deepEqual(outcome, { state: "on" });
    const record = (await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins[PLUGIN];
    assert.equal(record?.enabled, true);
    assert.equal(record?.updatedBy, "system:connect-defaults");
  });
});

test("an operator's own 'off' is kept and reported", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN, enabled: false, actor: "owner" });
    const outcome = await switchOnSavedTokenConnection(await operatorEnabledRow(), { pluginId: PLUGIN, connectionId: "remote" });
    assert.deepEqual(outcome, { state: "plugin-off-by-operator" });
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins[PLUGIN]?.enabled, false);
  });
});

test("an operator disable during connection setup is reported even when activations become read-only", async (t) => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    // Installed: every activation state now goes through the switch's checks, installed first.
    await installPlugin();
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: PLUGIN });
    const deps = await operatorEnabledRow();
    const lockPath = path.join(workspaceRoot, ACTIVATIONS_LOCK_FILENAME);
    const open = fs.open;
    let restoreOpen = () => {};
    try {
      const outcome = await switchOnSavedTokenConnection({ ...deps, onConnected: async () => {
        await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN, enabled: false, actor: "owner" });
        // Reads remain available; a write lock must not be needed just to report the operator's off.
        const openMock = t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
          if (args[0] === lockPath && args[1] === "wx") throw Object.assign(new Error("read-only activations"), { code: "EROFS" });
          return open(...args);
        });
        restoreOpen = () => { openMock.mock.restore(); syncBuiltinESMExports(); };
        syncBuiltinESMExports();
      } }, { pluginId: PLUGIN, connectionId: "remote" });

      assert.deepEqual(outcome, { state: "plugin-off-by-operator" });
      assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN]?.enabled, false);
    } finally {
      restoreOpen();
    }
  });
});

test("no activation record reads as on and writes nothing", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    await installPlugin();
    const outcome = await switchOnSavedTokenConnection(await operatorEnabledRow(), { pluginId: PLUGIN, connectionId: "remote" });
    assert.deepEqual(outcome, { state: "on" });
    assert.equal(Object.hasOwn((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins, PLUGIN), false);
  });
});


test("the production fallback enables an untouched saved-token row with the installed plugin's declared grants", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    await seedBundledAgentPlugins({ layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }), workspaceId: WORKSPACE, sourceRoot: path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins") });
    const repo = new InMemoryExternalMcpServerRepo();
    const keyring = new InMemoryKeyring();
    const sealer = new AesGcmSecretSealer(keyring);
    const clock = { nowMs: () => Date.parse("2026-09-29T00:00:00.000Z"), nowIso: () => "2026-09-29T00:00:00.000Z" };
    await saveExternalMcpServer({ repo, sealer, keyring, clock }, {
      workspaceId: WORKSPACE, serverId: "supabase", transport: "streamable_http", authMode: "static_env",
      enabled: false, command: "", url: "https://mcp.supabase.com/mcp?features=account,database,development,docs,debugging",
      args: "", allowedToolNames: "", writeAllowedToolNames: "", accessToken: "saved-test-token",
      principalId: "owner", provisionedByPluginId: "supabase",
    });
    const before = (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "supabase" }))!;
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins.supabase?.enabled, false);
    assert.deepEqual(await switchOnSavedTokenConnection({ workspaceId: WORKSPACE, agentPluginLayout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }), mcp: { repo }, clock, notifyRosterChanged: async () => {} }, { pluginId: "supabase", connectionId: "supabase" }), { state: "on" });
    const row = (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "supabase" }))!;
    assert.equal(row.enabled, true);
    assert.ok(JSON.parse(row.allowedToolNames ?? "[]").includes("list_projects"));
    assert.deepEqual(JSON.parse(row.writeAllowedToolNames ?? "[]"), ["confirm_cost", "create_project", "pause_project", "restore_project"]);
    assert.equal(row.writeGrantsUpdatedByPrincipalId, "system:connect-defaults");
    assert.deepEqual(row.sealedOAuth, before.sealedOAuth);
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins.supabase?.enabled, true);
  });
});

test("a connection row an operator left disabled is reported as off, and the plugin is never switched on", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: PLUGIN });
    const deps = await operatorEnabledRow();
    const row = (await deps.mcp.repo.findByServerId({ workspaceId: WORKSPACE, serverId: "remote" }))!;
    await deps.mcp.repo.upsert({ ...row, enabled: false });
    const switched: string[] = [];
    const outcome = await switchOnSavedTokenConnection({ ...deps, switchPluginOn: async (pluginId) => (switched.push(pluginId), true) }, { pluginId: PLUGIN, connectionId: "remote" });
    assert.deepEqual(outcome, { state: "connection-off-by-operator" });
    assert.deepEqual(switched, []);
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN]?.enabled, false);
  });
});

test("a missing connection row is reported as off", async () => {
  await withAgentPluginsDir(async () => {
    const deps = await operatorEnabledRow();
    assert.deepEqual(await switchOnSavedTokenConnection(deps, { pluginId: PLUGIN, connectionId: "no-such-row" }), { state: "connection-off-by-operator" });
  });
});

test("a plugin an operator already switched on stays on without a write", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    await installPlugin();
    await setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN, enabled: true, actor: "owner" });
    const outcome = await switchOnSavedTokenConnection(await operatorEnabledRow(), { pluginId: PLUGIN, connectionId: "remote" });
    assert.deepEqual(outcome, { state: "on" });
    assert.equal((await readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN]?.updatedBy, "owner");
  });
});

test("injected activation ports decide the outcome: an operator-off check short-circuits, a refused switch-on is off", async () => {
  await withAgentPluginsDir(async () => {
    const deps = await operatorEnabledRow();
    const seen: string[] = [];
    assert.deepEqual(await switchOnSavedTokenConnection({ ...deps, isPluginOffByOperator: async (id) => (seen.push(`off?${id}`), true),
      onConnected: async () => assert.fail("never connects a plugin the operator turned off") }, { pluginId: PLUGIN, connectionId: "remote" }), { state: "plugin-off-by-operator" });
    assert.deepEqual(await switchOnSavedTokenConnection({ ...deps, isPluginOffByOperator: async () => false,
      switchPluginOn: async (id) => (seen.push(`on!${id}`), false) }, { pluginId: PLUGIN, connectionId: "remote" }), { state: "plugin-off-by-operator" });
    assert.deepEqual(seen, [`off?${PLUGIN}`, `on!${PLUGIN}`]);
  });
});

test("describeSavedTokenSwitch names the screen that turns each kind of 'off' back on", () => {
  const names = { displayName: "Some Plugin", connectionId: "remote" };
  assert.equal(describeSavedTokenSwitch({ state: "on" }, names), "Some Plugin is connected and switched on. Its tools are ready to use.");
  assert.equal(describeSavedTokenSwitch({ state: "plugin-off-by-operator" }, names),
    `Token saved. Some Plugin stays off because an operator turned it off. To use it, switch 'Some Plugin' on in ${AGENT_PLUGINS_SCREEN}.`);
  assert.equal(describeSavedTokenSwitch({ state: "connection-off-by-operator" }, names),
    `Token saved. The 'remote' connection stays off because an operator changed its settings. To use it, switch it on in ${EXTERNAL_MCP_SCREEN}.`);
});
