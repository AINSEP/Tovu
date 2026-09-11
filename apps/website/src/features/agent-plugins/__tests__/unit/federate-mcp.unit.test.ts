import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryExternalMcpServerRepo, listExternalMcpServerViews, saveExternalMcpServer, type ExternalMcpStoreDeps } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import { deriveAgentPluginConnectionId, planAgentPluginMcpFederation, provisionAgentPluginMcpServers } from "../../federate-mcp.js";
import type { McpServerConfig } from "../../manifest.js";

/**
 * @file `federate-mcp.ts` — Phase 4 of the 2026-09-10 plugin-MCP-wiring work, rewritten against the
 * owner's collision-rule refinement (`ADS-memory/reports/2026-09-10-plugin-mcp-wiring-handoff.md`):
 * one verbatim connection id, no hash-suffixed fallback, and adoption (not a silent skip) when a row
 * already exists at that id under an operator or a different plugin. Reuses the SAME
 * `InMemoryExternalMcpServerRepo`/`InMemoryKeyring`/`AesGcmSecretSealer` stack
 * `assistant/__tests__/external-mcp-store.test.ts` builds its own fixtures from — a real store, not a
 * mock, so a passing test here is evidence the row this file writes (or leaves alone) actually
 * round-trips through the same store the daemon reads at boot.
 */

const STDIO_SERVER: McpServerConfig = { type: "stdio", command: "./server/index.js" };
const REMOTE_SERVER: McpServerConfig = { type: "streamable-http", url: "https://mcp.example.com/mcp" };
const OAUTH_SERVER: McpServerConfig = { type: "streamable-http", url: "https://mcp.higgsfield.ai/mcp", tovuAuthMode: "oauth" };
const SSE_SERVER: McpServerConfig = { type: "sse", url: "https://mcp.example.com/sse" };

const clock = { nowIso: () => "2026-09-10T00:00:00.000Z" };

function makeDeps(): ExternalMcpStoreDeps {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer, clock };
}

test("deriveAgentPluginConnectionId sanitizes the server key verbatim, without hashing or namespacing by plugin", () => {
  assert.equal(deriveAgentPluginConnectionId("Higgsfield"), "higgsfield");
});

test("deriveAgentPluginConnectionId matches the trust tier's own CONNECTION_ID_PATTERN", () => {
  const id = deriveAgentPluginConnectionId("My Server!! v2");
  assert.match(id ?? "", /^[a-z0-9][a-z0-9-]{0,39}$/);
});

test("deriveAgentPluginConnectionId returns null when the key sanitizes to nothing usable", () => {
  assert.equal(deriveAgentPluginConnectionId("!!!"), null);
});

test("deriveAgentPluginConnectionId truncates to 40 characters and stays a valid id", () => {
  const id = deriveAgentPluginConnectionId("a".repeat(100));
  assert.ok(id !== null && id.length <= 40);
  assert.match(id ?? "", /^[a-z0-9][a-z0-9-]{0,39}$/);
});

test("planAgentPluginMcpFederation: a stdio server is skipped, never planned for upsert", () => {
  const plan = planAgentPluginMcpFederation({ servers: { local: STDIO_SERVER } });
  assert.deepEqual(plan.toUpsert, []);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]?.serverKey, "local");
  assert.match(plan.skipped[0]?.reason ?? "", /stdio/);
});

test("planAgentPluginMcpFederation: a remote streamable-http server is planned, authMode defaults to 'none'", () => {
  const plan = planAgentPluginMcpFederation({ servers: { remote: REMOTE_SERVER } });
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.toUpsert.length, 1);
  assert.equal(plan.toUpsert[0]?.authMode, "none");
  assert.equal(plan.toUpsert[0]?.url, "https://mcp.example.com/mcp");
  assert.equal(plan.toUpsert[0]?.connectionId, "remote");
});

test("planAgentPluginMcpFederation: tovuAuthMode: 'oauth' on the server carries through to authMode", () => {
  const plan = planAgentPluginMcpFederation({ servers: { higgsfield: OAUTH_SERVER } });
  assert.equal(plan.toUpsert[0]?.authMode, "oauth");
});

test("planAgentPluginMcpFederation: an sse server is skipped as an unsupported transport, not silently dropped", () => {
  const plan = planAgentPluginMcpFederation({ servers: { legacy: SSE_SERVER } });
  assert.deepEqual(plan.toUpsert, []);
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0]?.reason ?? "", /sse/);
});

test("planAgentPluginMcpFederation: a mixed set resolves each server independently", () => {
  const plan = planAgentPluginMcpFederation({
    servers: { local: STDIO_SERVER, remote: REMOTE_SERVER, legacy: SSE_SERVER },
  });
  assert.deepEqual(plan.toUpsert.map((p) => p.serverKey), ["remote"]);
  assert.deepEqual(plan.skipped.map((s) => s.serverKey).sort(), ["legacy", "local"]);
});

test("provisionAgentPluginMcpServers: enabling a plugin with one auto-admitted remote server creates a real, DISABLED row", async () => {
  const deps = makeDeps();
  const result = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    principalId: "principal-1",
  });

  assert.equal(result.failed.length, 0);
  assert.deepEqual(result.provisioned, ["remote"]);
  assert.deepEqual(result.alreadyProvisioned, []);
  assert.deepEqual(result.adopted, []);

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 1);
  assert.equal(views[0]?.serverId, "remote");
  assert.equal(views[0]?.transport, "streamable_http");
  assert.equal(views[0]?.url, "https://mcp.example.com/mcp");
  // Rule 2: a newly provisioned row is never auto-enabled — an operator must turn it on themselves.
  assert.equal(views[0]?.enabled, false);
  assert.equal(views[0]?.authMode, "none");
  // Rule 3: provisioning is not authorization — the allowlist starts empty regardless of plugin content.
  assert.deepEqual(views[0]?.allowedToolNames, []);
  assert.deepEqual(views[0]?.writeAllowedToolNames, []);
  assert.equal(views[0]?.provisionedByPluginId, "some-plugin");
});

test("provisionAgentPluginMcpServers: an oauth-mode server is saved with authMode oauth and an authorization_code grant", async () => {
  const deps = makeDeps();
  await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "higgsfield-media",
    servers: { higgsfield: OAUTH_SERVER },
    principalId: "principal-1",
  });

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views[0]?.serverId, "higgsfield");
  assert.equal(views[0]?.authMode, "oauth");
  assert.equal(views[0]?.oauth.grant, "authorization_code");
  // No client id/secret is set — a real operator OAuth consent (or dynamic client registration at
  // connect time) is still required; this row only removes the need to hand-type the URL/transport.
  assert.equal(views[0]?.oauth.clientId, null);
});

test("provisionAgentPluginMcpServers: stdio and sse servers never produce a row even when enabling", async () => {
  const deps = makeDeps();
  await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { local: STDIO_SERVER, legacy: SSE_SERVER },
    principalId: "principal-1",
  });

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.deepEqual(views, []);
});

test("provisionAgentPluginMcpServers: the SAME plugin enabling twice reports alreadyProvisioned, not a second row or an adoption", async () => {
  const deps = makeDeps();
  const first = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    principalId: "principal-1",
  });
  assert.deepEqual(first.provisioned, ["remote"]);

  const second = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    principalId: "principal-1",
  });
  assert.deepEqual(second.provisioned, []);
  assert.deepEqual(second.adopted, []);
  assert.deepEqual(second.alreadyProvisioned, ["remote"]);

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 1, "still exactly one row");
});

test("provisionAgentPluginMcpServers: an operator's pre-existing row with a live allowlist, write grants and OAuth tokens survives enabling completely untouched — only provisionedByPluginId changes", async () => {
  const deps = makeDeps();

  // Seed the row the way an operator's own Settings -> External MCP save would: a real allowlist, a
  // write grant, a pasted credential, and (structurally) an oauth configuration — everything rule 1
  // exists to protect, and everything a careless upsert would wipe.
  await saveExternalMcpServer(deps, {
    workspaceId: "ws-1",
    serverId: "remote",
    label: "My Own Remote Connection",
    transport: "streamable_http",
    authMode: "static_env",
    enabled: true,
    command: "",
    url: "https://operator-configured.example.com/mcp",
    args: "",
    allowedToolNames: "search,fetch",
    writeAllowedToolNames: "search",
    env: "API_KEY=super-secret-value",
    principalId: "operator-1",
  });
  const before = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });
  assert.ok(before, "seed row must exist before adoption");
  assert.equal(before.provisionedByPluginId, null, "an operator-created row starts with no plugin association");

  // A plugin declares the SAME server key ("remote") the operator already configured by hand.
  const result = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    principalId: "principal-1",
  });

  assert.deepEqual(result.provisioned, [], "must never call saveExternalMcpServer on an existing row");
  assert.deepEqual(result.alreadyProvisioned, []);
  assert.deepEqual(result.adopted, ["remote"]);

  const after = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });
  assert.ok(after);
  assert.equal(after.provisionedByPluginId, "some-plugin", "the only field adoption may change");
  // Byte-identical otherwise: comparing with provisionedByPluginId normalized back to `before`'s
  // value proves every other column (url, transport, authMode, enabled, allowlist, write grants,
  // sealed env, timestamps, aad versions) is untouched.
  assert.deepEqual({ ...after, provisionedByPluginId: before.provisionedByPluginId }, before);
  // Named explicitly, since these are exactly what a careless upsert would wipe.
  assert.deepEqual(JSON.parse(after.allowedToolNames ?? "[]"), ["search", "fetch"]);
  assert.deepEqual(JSON.parse(after.writeAllowedToolNames ?? "[]"), ["search"]);
  assert.equal(after.enabled, true, "an operator-enabled row must not be forced back to disabled");
  assert.equal(after.url, "https://operator-configured.example.com/mcp", "the plugin's own declared URL must never override the operator's");
});

test("provisionAgentPluginMcpServers: two different plugins declaring the same server key share one row via adoption, not two independent rows", async () => {
  const deps = makeDeps();
  const first = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "plugin-a",
    servers: { main: REMOTE_SERVER },
    principalId: "principal-1",
  });
  assert.deepEqual(first.provisioned, ["main"]);

  const second = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "plugin-b",
    servers: { main: REMOTE_SERVER },
    principalId: "principal-1",
  });
  assert.deepEqual(second.provisioned, []);
  assert.deepEqual(second.adopted, ["main"], "the second plugin adopts the association rather than losing it or getting a shadow row");

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 1, "one shared row, not two");
  assert.equal(views[0]?.provisionedByPluginId, "plugin-b", "the most recently enabling plugin owns the association");
});
