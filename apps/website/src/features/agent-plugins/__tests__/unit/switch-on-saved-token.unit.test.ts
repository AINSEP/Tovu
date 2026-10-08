
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { InMemoryExternalMcpServerRepo, saveExternalMcpServer } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";


import { resolveAgentPluginLayout } from "../../layout.js";
import { seedBundledAgentPlugins } from "../../lifecycle.js";
import { switchOnSavedTokenConnection } from "../../switch-on-saved-token.js";
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
    await fn(resolveAgentPluginLayout().forWorkspace(WORKSPACE).root);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
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
  return { workspaceId: WORKSPACE, externalMcpServerRepo: repo, clock, onConnected: async () => {} };
}

test("the seeder's default 'off' is switched on with the row, and only then reported on", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
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

test("no activation record reads as on and writes nothing", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    const outcome = await switchOnSavedTokenConnection(await operatorEnabledRow(), { pluginId: PLUGIN, connectionId: "remote" });
    assert.deepEqual(outcome, { state: "on" });
    assert.equal(Object.hasOwn((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins, PLUGIN), false);
  });
});


test("the production fallback enables an untouched saved-token row with the installed plugin's declared grants", async () => {
  await withAgentPluginsDir(async (workspaceRoot) => {
    await seedBundledAgentPlugins({ layout: resolveAgentPluginLayout(), workspaceId: WORKSPACE, sourceRoot: path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins") });
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
    assert.deepEqual(await switchOnSavedTokenConnection({ workspaceId: WORKSPACE, externalMcpServerRepo: repo, clock }, { pluginId: "supabase", connectionId: "supabase" }), { state: "on" });
    const row = (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "supabase" }))!;
    assert.equal(row.enabled, true);
    assert.ok(JSON.parse(row.allowedToolNames ?? "[]").includes("list_projects"));
    assert.deepEqual(JSON.parse(row.writeAllowedToolNames ?? "[]"), ["confirm_cost", "create_project", "pause_project", "restore_project"]);
    assert.equal(row.writeGrantsUpdatedByPrincipalId, "system:connect-defaults");
    assert.deepEqual(row.sealedOAuth, before.sealedOAuth);
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins.supabase?.enabled, true);
  });
});
