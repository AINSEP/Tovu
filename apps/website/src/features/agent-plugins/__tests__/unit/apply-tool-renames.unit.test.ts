import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryExternalMcpServerRepo, saveExternalMcpServer } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import { applyAgentPluginToolRenames, renameToolNames } from "../../apply-tool-renames.js";
import type { InstalledAgentPluginServers } from "../../import-access-token.js";
import type { McpServerConfig } from "../../manifest.js";

/**
 * @file `apply-tool-renames.ts` — a plugin's declared `tovuRenamedTools` rewrite the saved tool lists
 * of the rows that plugin provisioned, at boot, so a vendor rename (Supabase `get_logs` ->
 * `query_logs`, 2026-09-29) never leaves a selection naming a tool the server stopped offering.
 * Runs against the real in-memory store, so a pass here means the row the daemon reads changed.
 */

const WORKSPACE = "workspace-1";
const SERVER = "supabase";
const PLUGIN = "supabase";
const URL_ = "https://mcp.example.com/mcp";
const NOW = "2026-09-29T12:00:00.000Z";

const DECLARED: McpServerConfig = {
  type: "streamable-http",
  url: URL_,
  tovuRenamedTools: { get_logs: "query_logs" },
};

async function makeHarness(row: {
  allowedToolNames: string;
  writeAllowedToolNames?: string;
  provisionedByPluginId?: string | null;
  url?: string;
  declared?: McpServerConfig;
}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => NOW };
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock: { nowIso: () => "2026-09-01T00:00:00.000Z" } },
    {
      workspaceId: WORKSPACE,
      serverId: SERVER,
      label: "supabase · supabase",
      transport: "streamable_http",
      authMode: "none",
      enabled: true,
      command: "",
      url: row.url ?? URL_,
      args: "",
      allowedToolNames: row.allowedToolNames,
      writeAllowedToolNames: row.writeAllowedToolNames ?? "",
      principalId: "operator-1",
      ...(row.provisionedByPluginId === null ? {} : { provisionedByPluginId: row.provisionedByPluginId ?? PLUGIN }),
    },
  );
  const plugins: InstalledAgentPluginServers[] = [{ pluginId: PLUGIN, servers: { supabase: row.declared ?? DECLARED } }];
  let notifications = 0;
  const logs: string[] = [];
  const run = () =>
    applyAgentPluginToolRenames(
      {
        workspaceId: WORKSPACE,
        externalMcpServerRepo: repo,
        clock,
        listPlugins: async () => plugins,
        notifyRosterChanged: async () => {
          notifications += 1;
        },
      },
      { info: (m) => logs.push(`info: ${m}`), warn: (m) => logs.push(`warn: ${m}`) },
    );
  const read = async () => {
    const saved = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(saved);
    return saved;
  };
  return { run, read, logs, notifications: () => notifications };
}

test("renameToolNames: replaces renamed names in place, drops a duplicate the rename creates, null when nothing matched", () => {
  assert.deepEqual(renameToolNames(["a", "get_logs", "b"], { get_logs: "query_logs" }), ["a", "query_logs", "b"]);
  assert.deepEqual(renameToolNames(["get_logs", "query_logs"], { get_logs: "query_logs" }), ["query_logs"]);
  assert.equal(renameToolNames(["a", "b"], { get_logs: "query_logs" }), null);
  assert.equal(renameToolNames([], { get_logs: "query_logs" }), null);
});

test("a provisioned row's saved allowlist follows the declared rename, and the roster is notified once", async () => {
  const h = await makeHarness({ allowedToolNames: "list_projects,get_logs,search_docs" });
  await h.run();
  const row = await h.read();
  assert.deepEqual(JSON.parse(row.allowedToolNames ?? "null"), ["list_projects", "query_logs", "search_docs"]);
  assert.equal(row.updatedAt, NOW);
  assert.equal(h.notifications(), 1);
  assert.deepEqual(h.logs, [
    "info: [agent-plugins] 'supabase': renamed saved tools to follow the 'supabase' plugin (get_logs -> query_logs).",
  ]);
});

test("a renamed WRITE grant stays a write grant, attributed to the rename; a read-only name never gains write", async () => {
  const withWrite = await makeHarness({ allowedToolNames: "get_logs,list_projects", writeAllowedToolNames: "get_logs" });
  await withWrite.run();
  const written = await withWrite.read();
  assert.deepEqual(JSON.parse(written.writeAllowedToolNames ?? "null"), ["query_logs"]);
  assert.equal(written.writeGrantsUpdatedByPrincipalId, "system:tool-renames");
  assert.equal(written.writeGrantsUpdatedAt, NOW);

  const readOnly = await makeHarness({ allowedToolNames: "get_logs,create_project", writeAllowedToolNames: "create_project" });
  const before = await readOnly.read();
  await readOnly.run();
  const after = await readOnly.read();
  assert.deepEqual(JSON.parse(after.writeAllowedToolNames ?? "null"), ["create_project"]);
  assert.equal(after.writeGrantsUpdatedByPrincipalId, before.writeGrantsUpdatedByPrincipalId);
  assert.equal(after.writeGrantsUpdatedAt, before.writeGrantsUpdatedAt);
});

test("a second boot finds nothing to rename: no write, no log, no notification", async () => {
  const h = await makeHarness({ allowedToolNames: "get_logs" });
  await h.run();
  const first = await h.read();
  h.logs.length = 0;
  await h.run();
  assert.deepEqual(await h.read(), first);
  assert.deepEqual(h.logs, []);
  assert.equal(h.notifications(), 1);
});

test("a row selecting no renamed tool is left byte-identical", async () => {
  const h = await makeHarness({ allowedToolNames: "list_projects,query_logs" });
  const before = await h.read();
  await h.run();
  assert.deepEqual(await h.read(), before);
  assert.equal(h.notifications(), 0);
});

test("an operator's own row (no provisioning plugin) is never touched", async () => {
  const h = await makeHarness({ allowedToolNames: "get_logs", provisionedByPluginId: null });
  const before = await h.read();
  await h.run();
  assert.deepEqual(await h.read(), before);
  assert.equal(h.notifications(), 0);
});

test("a row provisioned by a DIFFERENT plugin is never touched", async () => {
  const h = await makeHarness({ allowedToolNames: "get_logs", provisionedByPluginId: "other-plugin" });
  const before = await h.read();
  await h.run();
  assert.deepEqual(await h.read(), before);
});

test("a row pointed at a different url than the plugin declares is never touched", async () => {
  const h = await makeHarness({ allowedToolNames: "get_logs", url: "https://elsewhere.example.com/mcp" });
  const before = await h.read();
  await h.run();
  assert.deepEqual(await h.read(), before);
});

test("a plugin that declares no renames writes nothing", async () => {
  const h = await makeHarness({ allowedToolNames: "get_logs", declared: { type: "streamable-http", url: URL_ } });
  const before = await h.read();
  await h.run();
  assert.deepEqual(await h.read(), before);
  assert.equal(h.notifications(), 0);
});

test("a plugin listing that throws is a warning, never a boot failure", async () => {
  const logs: string[] = [];
  await applyAgentPluginToolRenames(
    {
      workspaceId: WORKSPACE,
      externalMcpServerRepo: new InMemoryExternalMcpServerRepo(),
      clock: { nowIso: () => NOW },
      listPlugins: async () => {
        throw new Error("package store unreadable");
      },
      notifyRosterChanged: async () => assert.fail("must not notify"),
    },
    { info: (m) => logs.push(m), warn: (m) => logs.push(m) },
  );
  assert.deepEqual(logs, ["[agent-plugins] could not list plugins to apply tool renames: package store unreadable"]);
});
