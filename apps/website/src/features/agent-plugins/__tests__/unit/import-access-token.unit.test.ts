import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryExternalMcpServerRepo, saveExternalMcpServer } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import { hasStoredAgentPluginCredential } from "../../connect-tool.js";
import {
  importAgentPluginAccessToken,
  importAgentPluginAccessTokensFromEnv,
  type ImportAgentPluginAccessTokensFromEnvDeps,
} from "../../import-access-token.js";
import { parseAgentPluginMcpConfig, type McpServerConfig } from "../../manifest.js";

/**
 * @file `import-access-token.ts`: a token that did not come through the paste form (the retired
 * `TOVU_SUPABASE_MCP_ACCESS_TOKEN` env var, or create-site onboarding) is sealed onto the plugin's
 * row and the plugin is switched on — and a row that already has a credential is never overwritten.
 * Real store and sealer; the plugin declaration and `onConnected` are injected.
 */

const WORKSPACE = "ws-token-import";
const TOKEN = "sbp_import_test_token_never_logged";
const ENV_VAR = "TOVU_SUPABASE_MCP_ACCESS_TOKEN";
const RETIRED = ["TOVU_SUPABASE_MCP_ENABLED", "TOVU_SUPABASE_MCP_PROJECT_REF"];

const SUPABASE_SERVERS: Readonly<Record<string, McpServerConfig>> = {
  supabase: {
    type: "streamable-http",
    url: "https://mcp.supabase.com/mcp",
    tovuAuthMode: "oauth",
    tovuTokenAuth: {
      helpUrl: "https://supabase.com/dashboard/account/tokens",
      probeUrl: "https://api.supabase.com/v1/projects",
      importFromEnv: ENV_VAR,
      retiredEnv: RETIRED,
    },
  },
};

async function setup() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => "2026-09-29T00:00:00.000Z" };
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: "supabase",
      transport: "streamable_http",
      authMode: "oauth",
      enabled: false,
      command: "",
      url: "https://mcp.supabase.com/mcp",
      args: "",
      allowedToolNames: "",
      writeAllowedToolNames: "",
      principalId: "owner",
      provisionedByPluginId: "supabase",
    },
  );
  const connected: string[] = [];
  const deps: ImportAgentPluginAccessTokensFromEnvDeps = {
    workspaceId: WORKSPACE,
    clock,
    externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    resolveInstalledPlugin: async (pluginId) => (pluginId === "supabase" ? { servers: SUPABASE_SERVERS } : null),
    listPlugins: async () => [{ pluginId: "supabase", servers: SUPABASE_SERVERS }],
    // Stands in for apply-connect-defaults: records the call and switches the row on.
    onConnected: async (serverId) => {
      connected.push(serverId);
      const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId });
      if (row) await repo.upsert({ ...row, enabled: true });
    },
    isPluginOffByOperator: async () => false,
  };
  const readRow = () => repo.findByServerId({ workspaceId: WORKSPACE, serverId: "supabase" });
  const logs = { info: [] as string[], warn: [] as string[] };
  const log = { info: (m: string) => void logs.info.push(m), warn: (m: string) => void logs.warn.push(m) };
  return { deps, connected, readRow, logs, log };
}

test("a token is sealed onto a row with no credential, and the plugin is switched on", async () => {
  const { deps, connected, readRow } = await setup();
  const outcome = await importAgentPluginAccessToken(deps, { pluginId: "supabase", token: TOKEN });
  assert.equal(outcome, "saved");
  const row = await readRow();
  assert.equal(row?.authMode, "static_env");
  assert.ok(row?.sealedEnv, "the token must be sealed on the row");
  assert.ok(!JSON.stringify(row).includes(TOKEN), "the token must never be stored in plaintext");
  assert.deepEqual(connected, ["supabase"]);
});

test("a row that already holds a saved token is never overwritten", async () => {
  const { deps, connected, readRow } = await setup();
  await importAgentPluginAccessToken(deps, { pluginId: "supabase", token: TOKEN });
  const before = (await readRow())?.sealedEnv;
  connected.length = 0;
  const outcome = await importAgentPluginAccessToken(deps, { pluginId: "supabase", token: "sbp_a_different_token" });
  assert.equal(outcome, "already-connected");
  assert.deepEqual((await readRow())?.sealedEnv, before);
  assert.deepEqual(connected, []);
});

test("a plugin an operator turned off gets the token but stays off", async () => {
  const { deps, connected, readRow } = await setup();
  const offDeps: ImportAgentPluginAccessTokensFromEnvDeps = { ...deps, isPluginOffByOperator: async () => true };
  assert.equal(await importAgentPluginAccessToken(offDeps, { pluginId: "supabase", token: TOKEN }), "saved-left-off");
  assert.equal((await readRow())?.authMode, "static_env");
  assert.equal((await readRow())?.enabled, false);
  assert.deepEqual(connected, [], "an operator's off switch must not be overridden");

  const { deps: envDeps, logs: envLogs, log: envLog } = await setup();
  await importAgentPluginAccessTokensFromEnv({ ...envDeps, isPluginOffByOperator: async () => true }, { [ENV_VAR]: TOKEN }, envLog);
  assert.equal(envLogs.info.length, 1);
  assert.match(envLogs.info[0] ?? "", /stays off because an operator turned it off \(Add-Ons → Agent Plugins\)/);
});

test("hasStoredAgentPluginCredential: a finished sign-in or a saved token counts; a bare oauth row does not", () => {
  assert.equal(hasStoredAgentPluginCredential({ authMode: "oauth", sealedEnv: null, oauthStatus: "connected" }), true);
  assert.equal(hasStoredAgentPluginCredential({ authMode: "static_env", sealedEnv: { ciphertext: "x", nonce: "y" } as never, oauthStatus: null }), true);
  assert.equal(hasStoredAgentPluginCredential({ authMode: "oauth", sealedEnv: null, oauthStatus: null }), false);
  assert.equal(hasStoredAgentPluginCredential({ authMode: "static_env", sealedEnv: null, oauthStatus: null }), false);
});

test("env import copies the declared env token once, logs once, and is silent on the next boot", async () => {
  const { deps, connected, readRow, logs, log } = await setup();
  await importAgentPluginAccessTokensFromEnv(deps, { [ENV_VAR]: `  ${TOKEN}  ` }, log);
  assert.equal((await readRow())?.authMode, "static_env");
  assert.deepEqual(connected, ["supabase"]);
  assert.equal(logs.info.length, 1);
  assert.match(logs.info[0] ?? "", /copied TOVU_SUPABASE_MCP_ACCESS_TOKEN onto the 'supabase' plugin's connection/);
  assert.ok(!logs.info.join("").includes(TOKEN), "a log line must never carry the token");

  await importAgentPluginAccessTokensFromEnv(deps, { [ENV_VAR]: TOKEN }, log);
  assert.equal(logs.info.length, 1, "a second boot must not log the copy again");
  assert.deepEqual(logs.warn, []);
});

test("env import with no token set writes nothing", async () => {
  const { deps, connected, readRow, logs, log } = await setup();
  await importAgentPluginAccessTokensFromEnv(deps, { [ENV_VAR]: "   " }, log);
  assert.equal((await readRow())?.authMode, "oauth");
  assert.deepEqual(connected, []);
  assert.deepEqual(logs.info, []);
});

test("set retired env vars are named as no longer used; unset ones are not", async () => {
  const { deps, logs, log } = await setup();
  await importAgentPluginAccessTokensFromEnv(deps, { TOVU_SUPABASE_MCP_ENABLED: "1" }, log);
  assert.equal(logs.info.length, 1);
  assert.match(logs.info[0] ?? "", /TOVU_SUPABASE_MCP_ENABLED is no longer used/);
  assert.ok(!(logs.info[0] ?? "").includes("TOVU_SUPABASE_MCP_PROJECT_REF"));
});

test("env import never throws: a failed save is a warning", async () => {
  const { deps, logs, log } = await setup();
  const broken: ImportAgentPluginAccessTokensFromEnvDeps = { ...deps, resolveInstalledPlugin: async () => null };
  await importAgentPluginAccessTokensFromEnv(broken, { [ENV_VAR]: TOKEN }, log);
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0] ?? "", /could not copy TOVU_SUPABASE_MCP_ACCESS_TOKEN onto the 'supabase' plugin/);
});

test("manifest: importFromEnv and retiredEnv parse; a malformed env name excludes the server", () => {
  const good = parseAgentPluginMcpConfig({
    mcpServers: {
      s: {
        type: "streamable-http",
        url: "https://example.com/mcp",
        tovuTokenAuth: { helpUrl: "https://example.com/t", probeUrl: "https://example.com/p", importFromEnv: "OLD_TOKEN", retiredEnv: ["OLD_A"] },
      },
    },
  });
  assert.ok(good.ok);
  const server = good.ok ? good.config.servers.s : undefined;
  assert.ok(server && server.type !== "stdio");
  assert.deepEqual(server.type !== "stdio" ? server.tovuTokenAuth : undefined, {
    helpUrl: "https://example.com/t",
    probeUrl: "https://example.com/p",
    importFromEnv: "OLD_TOKEN",
    retiredEnv: ["OLD_A"],
  });

  const bad = parseAgentPluginMcpConfig({
    mcpServers: {
      s: { type: "streamable-http", url: "https://example.com/mcp", tovuTokenAuth: { helpUrl: "https://example.com/t", probeUrl: "https://example.com/p", importFromEnv: "lower case" } },
    },
  });
  assert.ok(bad.ok);
  assert.equal(bad.ok ? bad.config.servers.s : "x", undefined);
});
