import assert from "node:assert/strict";
import test from "node:test";
import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryExternalMcpServerRepo } from "../../../external-mcp/external-mcp-store.memory.js";
import { saveExternalMcpServer } from "../../../external-mcp/external-mcp-store.js";
import { applyExternalMcpAccess, externalMcpAccessSnapshot } from "@jini-ai/mcp/federation/hosted";
import type { ExternalMcpServerRepoPort } from "@jini-ai/core/contracts/hosted-mcp";
import { applyAgentPluginToolRenames } from "../../apply-tool-renames.js";
import { provisionAgentPluginMcpServers } from "../../federate-mcp.js";
import { mcpTestPort } from "../fixtures/connection-service-ports.js";

/**
 * @file Lost updates in the two plugin writers of an external-MCP row (design S1): tool renames at
 * boot and adoption on enable. Each read the row, decided, then upserted `{ ...row }`; an admin's
 * disable that landed in between was silently re-enabled. The competing write is made deterministic
 * by running it right after the writer's first read of the row.
 */

const WORKSPACE = "workspace-1";
const SERVER = "supabase";
const PLUGIN = "supabase";
const URL_ = "https://mcp.example.com/mcp";
const NOW = "2026-11-17T12:00:00.000Z";
const clock = { nowMs: () => Date.parse(NOW), nowIso: () => NOW };

async function harness({ provisionedByPluginId }: { provisionedByPluginId: string | null }) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const deps = { repo, sealer, keyring, clock };
  await saveExternalMcpServer(deps, { workspaceId: WORKSPACE, serverId: SERVER, label: "supabase", transport: "streamable_http", authMode: "none", enabled: true, command: "",
    url: URL_, args: "", allowedToolNames: "list_projects,get_logs", writeAllowedToolNames: "", principalId: "operator-1",
    ...(provisionedByPluginId === null ? {} : { provisionedByPluginId }) });
  const row = async () => (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER }))!;
  const disable = async () => {
    const current = await row();
    await applyExternalMcpAccess({ repo, clock, workspaceId: WORKSPACE, serverId: SERVER, expected: externalMcpAccessSnapshot({ record: current }),
      access: { enabled: false, allowedToolNames: ["list_projects", "get_logs"], writeAllowedToolNames: [] }, principalId: "admin" });
  };
  /** The same repo, except that right after the first read of the row `onFirstRead` runs. */
  const racing = (onFirstRead: () => Promise<void>): ExternalMcpServerRepoPort => {
    let raced = false;
    return {
      listByWorkspaceId: (workspaceId) => repo.listByWorkspaceId(workspaceId),
      findByServerId: async (input) => { const found = await repo.findByServerId(input); if (!raced) { raced = true; await onFirstRead(); } return found; },
      upsert: (record) => repo.upsert(record), insert: (input) => repo.insert(input), updateIfVersion: (input) => repo.updateIfVersion(input),
      updateOAuthRuntime: (input) => repo.updateOAuthRuntime(input), deleteByServerId: (input) => repo.deleteByServerId(input),
      updateAccessIfCurrent: (input) => repo.updateAccessIfCurrent(input), tryClaimOAuthRefreshLease: (input) => repo.tryClaimOAuthRefreshLease(input),
      releaseOAuthRefreshLease: (input) => repo.releaseOAuthRefreshLease(input),
    };
  };
  return { deps, row, disable, racing };
}

test("tool renames: a disable that lands between the rename's read and write is not undone, and the rename still applies", async () => {
  const h = await harness({ provisionedByPluginId: PLUGIN });
  const logs: string[] = [];
  await applyAgentPluginToolRenames(
    { deps: testSiteLayoutContext({ workspaceId: WORKSPACE, externalMcpServerRepo: h.racing(h.disable), clock,
      listPlugins: async () => [{ pluginId: PLUGIN, servers: { supabase: { type: "streamable-http", url: URL_, renamedTools: { get_logs: "query_logs" } } } }],
      notifyRosterChanged: async () => {} }),
    log: { info: (m) => logs.push(m), warn: (m) => logs.push(`warn: ${m}`) } },
  );
  const after = await h.row();
  assert.equal(after.enabled, false, "the rename restored the enabled flag it read before the admin's disable");
  assert.deepEqual(JSON.parse(after.allowedToolNames ?? "null"), ["list_projects", "query_logs"]);
  assert.deepEqual(logs.filter(line => line.startsWith("warn")), []);
});

test("adoption: a disable that lands between the adoption's read and write is not undone, and the plugin still adopts the row", async () => {
  const h = await harness({ provisionedByPluginId: null });
  const result = await provisionAgentPluginMcpServers(mcpTestPort({ ...h.deps, repo: h.racing(h.disable) }), { workspaceId: WORKSPACE, pluginId: PLUGIN,
    servers: { [SERVER]: { type: "streamable-http", url: URL_ } }, principalId: "principal-1" });
  assert.deepEqual(result.adopted, [SERVER]);
  const after = await h.row();
  assert.equal(after.provisionedByPluginId, PLUGIN);
  assert.equal(after.enabled, false, "the adoption restored the enabled flag it read before the admin's disable");
});
