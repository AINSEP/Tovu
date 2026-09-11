import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryExternalMcpServerRepo, listExternalMcpServerViews, type ExternalMcpStoreDeps } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import {
  applyAgentPluginMcpFederation,
  deriveAgentPluginConnectionId,
  planAgentPluginMcpFederation,
} from "../../federate-mcp.js";
import type { McpServerConfig } from "../../manifest.js";

/**
 * @file `federate-mcp.ts` — Phase 4 of the 2026-09-10 plugin-MCP-wiring work. Reuses the SAME
 * `InMemoryExternalMcpServerRepo`/`InMemoryKeyring`/`AesGcmSecretSealer` stack
 * `assistant/__tests__/external-mcp-store.test.ts` builds its own fixtures from — a real store, not
 * a mock, so a passing test here is evidence the row this file writes actually round-trips through
 * the same store the daemon reads at boot, not merely that `saveExternalMcpServer` was called with
 * plausible-looking arguments.
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

test("deriveAgentPluginConnectionId is deterministic for the same plugin/server pair", () => {
  const first = deriveAgentPluginConnectionId("higgsfield-media", "higgsfield");
  const second = deriveAgentPluginConnectionId("higgsfield-media", "higgsfield");
  assert.equal(first, second);
});

test("deriveAgentPluginConnectionId matches the trust tier's own CONNECTION_ID_PATTERN", () => {
  const id = deriveAgentPluginConnectionId("higgsfield-media", "higgsfield");
  assert.match(id, /^[a-z0-9][a-z0-9-]{0,39}$/);
});

test("deriveAgentPluginConnectionId stays valid and unique even for very long plugin/server names", () => {
  const longPlugin = "a".repeat(100);
  const longServer = "b".repeat(100);
  const id = deriveAgentPluginConnectionId(longPlugin, longServer);
  assert.match(id, /^[a-z0-9][a-z0-9-]{0,39}$/);
  assert.ok(id.length <= 40);

  const otherId = deriveAgentPluginConnectionId(longPlugin, `${longServer}x`);
  assert.notEqual(id, otherId, "two distinct pairs must not collide even after truncation");
});

test("deriveAgentPluginConnectionId differs for two different plugins declaring the same server key", () => {
  const a = deriveAgentPluginConnectionId("plugin-a", "main");
  const b = deriveAgentPluginConnectionId("plugin-b", "main");
  assert.notEqual(a, b);
});

test("planAgentPluginMcpFederation: a stdio server is skipped, never planned for upsert", () => {
  const plan = planAgentPluginMcpFederation({ pluginId: "some-plugin", servers: { local: STDIO_SERVER } });
  assert.deepEqual(plan.toUpsert, []);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]?.serverKey, "local");
  assert.match(plan.skipped[0]?.reason ?? "", /stdio/);
});

test("planAgentPluginMcpFederation: a remote streamable-http server is planned, authMode defaults to 'none'", () => {
  const plan = planAgentPluginMcpFederation({ pluginId: "some-plugin", servers: { remote: REMOTE_SERVER } });
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.toUpsert.length, 1);
  assert.equal(plan.toUpsert[0]?.authMode, "none");
  assert.equal(plan.toUpsert[0]?.url, "https://mcp.example.com/mcp");
});

test("planAgentPluginMcpFederation: tovuAuthMode: 'oauth' on the server carries through to authMode", () => {
  const plan = planAgentPluginMcpFederation({ pluginId: "higgsfield-media", servers: { higgsfield: OAUTH_SERVER } });
  assert.equal(plan.toUpsert[0]?.authMode, "oauth");
});

test("planAgentPluginMcpFederation: an sse server is skipped as an unsupported transport, not silently dropped", () => {
  const plan = planAgentPluginMcpFederation({ pluginId: "some-plugin", servers: { legacy: SSE_SERVER } });
  assert.deepEqual(plan.toUpsert, []);
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0]?.reason ?? "", /sse/);
});

test("planAgentPluginMcpFederation: a mixed set resolves each server independently", () => {
  const plan = planAgentPluginMcpFederation({
    pluginId: "some-plugin",
    servers: { local: STDIO_SERVER, remote: REMOTE_SERVER, legacy: SSE_SERVER },
  });
  assert.deepEqual(plan.toUpsert.map((p) => p.serverKey), ["remote"]);
  assert.deepEqual(plan.skipped.map((s) => s.serverKey).sort(), ["legacy", "local"]);
});

test("applyAgentPluginMcpFederation: enabling a plugin with one auto-admitted remote server creates a real row", async () => {
  const deps = makeDeps();
  const result = await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    enabled: true,
    principalId: "principal-1",
  });

  assert.equal(result.failed.length, 0);
  assert.equal(result.applied.length, 1);
  const [connectionId] = result.applied;

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 1);
  assert.equal(views[0]?.serverId, connectionId);
  assert.equal(views[0]?.transport, "streamable_http");
  assert.equal(views[0]?.url, "https://mcp.example.com/mcp");
  assert.equal(views[0]?.enabled, true);
  assert.equal(views[0]?.authMode, "none");
});

test("applyAgentPluginMcpFederation: an oauth-mode server is saved with authMode oauth and an authorization_code grant", async () => {
  const deps = makeDeps();
  await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "higgsfield-media",
    servers: { higgsfield: OAUTH_SERVER },
    enabled: true,
    principalId: "principal-1",
  });

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views[0]?.authMode, "oauth");
  assert.equal(views[0]?.oauth.grant, "authorization_code");
  // No client id/secret is set — a real operator OAuth consent (or dynamic client registration at
  // connect time) is still required; this row only removes the need to hand-type the URL/transport.
  assert.equal(views[0]?.oauth.clientId, null);
});

test("applyAgentPluginMcpFederation: stdio and sse servers never produce a row even when enabling", async () => {
  const deps = makeDeps();
  await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { local: STDIO_SERVER, legacy: SSE_SERVER },
    enabled: true,
    principalId: "principal-1",
  });

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.deepEqual(views, []);
});

test("applyAgentPluginMcpFederation: disabling a plugin that was never enabled creates nothing", async () => {
  const deps = makeDeps();
  const result = await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    enabled: false,
    principalId: "principal-1",
  });

  assert.deepEqual(result.applied, []);
  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.deepEqual(views, []);
});

test("applyAgentPluginMcpFederation: disabling an already-federated plugin deactivates its row without deleting it", async () => {
  const deps = makeDeps();
  await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "higgsfield-media",
    servers: { higgsfield: OAUTH_SERVER },
    enabled: true,
    principalId: "principal-1",
  });

  await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "higgsfield-media",
    servers: { higgsfield: OAUTH_SERVER },
    enabled: false,
    principalId: "principal-1",
  });

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 1, "the row must still exist, only deactivated");
  assert.equal(views[0]?.enabled, false);
  // The oauth grant configured on first enable must survive the disable — re-enabling later must
  // not force the operator through OAuth consent again.
  assert.equal(views[0]?.oauth.grant, "authorization_code");
});

test("applyAgentPluginMcpFederation: re-enabling after a disable reactivates the SAME row (stable connection id)", async () => {
  const deps = makeDeps();
  const first = await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    enabled: true,
    principalId: "principal-1",
  });
  await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    enabled: false,
    principalId: "principal-1",
  });
  const third = await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { remote: REMOTE_SERVER },
    enabled: true,
    principalId: "principal-1",
  });

  assert.deepEqual(first.applied, third.applied);
  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 1);
  assert.equal(views[0]?.enabled, true);
});

test("applyAgentPluginMcpFederation: two different plugins declaring the same server key get independent rows", async () => {
  const deps = makeDeps();
  await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "plugin-a",
    servers: { main: REMOTE_SERVER },
    enabled: true,
    principalId: "principal-1",
  });
  await applyAgentPluginMcpFederation(deps, {
    workspaceId: "ws-1",
    pluginId: "plugin-b",
    servers: { main: REMOTE_SERVER },
    enabled: true,
    principalId: "principal-1",
  });

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 2);
  assert.notEqual(views[0]?.serverId, views[1]?.serverId);
});
