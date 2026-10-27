import { testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { forceRemove } from "../fixtures/force-remove.js";
import { installAgentPlugin } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { recordBundledAgentPluginDigests } from "../../lifecycle.js";

import { InMemoryExternalMcpServerRepo, listExternalMcpServerViews, saveExternalMcpServer, type ExternalMcpServerRepoPort, type ExternalMcpStoreDeps } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { openExternalMcpOAuthPayload, sealExternalMcpOAuthPayload } from "#src/assistant/external-mcp-store";

import { deriveAgentPluginConnectionId, findAgentPluginMcpServerDefaults, isEmptyJsonList, planAgentPluginMcpFederation, provisionAgentPluginMcpServers, resolveAgentPluginMcpServers, resolveAgentPluginReadOnlyRemoteNames } from "../../federate-mcp.js";
import type { McpServerConfig } from "../../mcp-metadata.js";

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
const HEADERED_SERVER: McpServerConfig = { type: "streamable-http", url: "https://mcp.example.com/mcp", headers: { "X-Tenant": "acme" } };

const clock = { nowMs: () => Date.parse("2026-09-10T00:00:00.000Z"), nowIso: () => "2026-09-10T00:00:00.000Z" };

test("MCP resolution keeps each workspace's bundled declaration despite competing digests and plugins", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-mcp-resolution-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    const layout = resolveAgentPluginLayout();
    const install = async (workspaceId: string, pluginId: string, servers: Record<string, McpServerConfig>) => {
      const files = {
        "plugin.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0" }),
        "mcp.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: servers }),
      };
      const archive = Buffer.from(JSON.stringify(files));
      return installAgentPlugin({ layout, workspaceId, archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader: {
        async *entries() {
          for (const [entryPath, text] of Object.entries(files)) {
            const bytes = Buffer.from(text);
            yield { kind: "file" as const, entryPath, declaredSize: bytes.length, executable: false, async *openReadStream() { yield bytes; } };
          }
        },
      } });
    };
    const first = { first: REMOTE_SERVER };
    const second = { second: OAUTH_SERVER };
    for (const [workspaceId, servers] of [["ws-1", first], ["ws-2", second]] as const) {
      await install(workspaceId, "requested", { obsolete: SSE_SERVER });
      const preferred = await install(workspaceId, "requested", servers);
      await install(workspaceId, "unrelated", { wrong: REMOTE_SERVER });
      await recordBundledAgentPluginDigests({ workspaceRoot: layout.forWorkspace(workspaceId).root, seeded: [{ pluginId: "requested", archiveDigest: preferred.archiveDigest }] });
    }
    assert.deepEqual({ ...await resolveAgentPluginMcpServers(testSiteLayoutContext({ workspaceId: "ws-1", pluginId: "requested" })) }, first);
    assert.deepEqual({ ...await resolveAgentPluginMcpServers(testSiteLayoutContext({ workspaceId: "ws-2", pluginId: "requested" })) }, second);
    assert.deepEqual(await resolveAgentPluginMcpServers(testSiteLayoutContext({ workspaceId: "absent", pluginId: "requested" })), {});
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
});

function makeDeps(): ExternalMcpStoreDeps {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer, clock };
}

/** A repo whose existence read rejects for one specific server id, delegating every other read and
 *  write to the real repo — the transient `findByServerId` failure finding 5-5 requires isolation
 *  for, without breaking the real store behavior the surrounding tests depend on. */
function repoWhoseLookupRejects(inner: ExternalMcpServerRepoPort, serverId: string, error: Error): ExternalMcpServerRepoPort {
  return {
    listByWorkspaceId: (workspaceId) => inner.listByWorkspaceId(workspaceId),
    findByServerId: (input) => (input.serverId === serverId ? Promise.reject(error) : inner.findByServerId(input)),
    upsert: (record) => inner.upsert(record),
    deleteByServerId: (input) => inner.deleteByServerId(input),
    tryClaimOAuthRefreshLease: (input) => inner.tryClaimOAuthRefreshLease(input),
    releaseOAuthRefreshLease: (input) => inner.releaseOAuthRefreshLease(input),
  };
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

test("planAgentPluginMcpFederation: a remote server declaring headers is skipped as unsupported, never planned with its headers dropped", () => {
  const plan = planAgentPluginMcpFederation({ servers: { tenant: HEADERED_SERVER } });
  assert.deepEqual(plan.toUpsert, []);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]?.serverKey, "tenant");
  assert.match(plan.skipped[0]?.reason ?? "", /headers/);
});

test("provisionAgentPluginMcpServers: a remote server declaring headers produces no row rather than one silently missing them", async () => {
  const deps = makeDeps();
  const result = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "some-plugin",
    servers: { tenant: HEADERED_SERVER },
    principalId: "principal-1",
  });

  assert.deepEqual(result.provisioned, []);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0]?.serverKey, "tenant");

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.deepEqual(views, []);
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

test("provisionAgentPluginMcpServers: the SAME plugin's untouched row is re-provisioned at the plugin's NEW url, dropping its old sign-in state", async () => {
  const deps = makeDeps();
  const oldServer: McpServerConfig = { type: "streamable-http", url: "https://mcp.higgsfield.ai/mcp", tovuAuthMode: "oauth" };
  const newServer: McpServerConfig = { ...oldServer, url: "https://mcp.higgsfield.ai/mcp?features=a,b" };
  const input = { workspaceId: "ws-1", pluginId: "some-plugin", principalId: "principal-1" };
  await provisionAgentPluginMcpServers(deps, { ...input, servers: { remote: oldServer } });
  const stale = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });
  assert.ok(stale);
  // A client registered against the old endpoint, never granted any tool.
  await deps.repo.upsert({ ...stale, oauthClientId: "stale-client", oauthStatus: "connected" });

  const result = await provisionAgentPluginMcpServers(deps, { ...input, servers: { remote: newServer } });

  assert.deepEqual(result.provisioned, ["remote"]);
  assert.deepEqual(result.alreadyProvisioned, []);
  const row = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });
  assert.equal(row?.url, "https://mcp.higgsfield.ai/mcp?features=a,b");
  assert.equal(row?.oauthClientId ?? null, null, "a client minted for the old endpoint must not be reused");
  assert.notEqual(row?.oauthStatus, "connected");
  assert.equal(row?.provisionedByPluginId, "some-plugin");
  assert.equal(row?.enabled, false);
});

test("provisionAgentPluginMcpServers: a disabled row holding a saved access token is kept when the plugin declares token sign-in", async () => {
  const deps = makeDeps();
  const server: McpServerConfig = {
    ...OAUTH_SERVER,
    tovuTokenAuth: { helpUrl: "https://example.com/tokens", probeUrl: "https://example.com/probe" },
  };
  const input = { workspaceId: "ws-1", pluginId: "some-plugin", principalId: "principal-1", servers: { remote: server } };
  await provisionAgentPluginMcpServers(deps, input);
  // What agent_plugin_set_access_token writes, with the plugin still off (row disabled, no tools).
  await saveExternalMcpServer(deps, {
    workspaceId: "ws-1",
    serverId: "remote",
    transport: "streamable_http",
    authMode: "static_env",
    enabled: false,
    command: "",
    url: "https://mcp.higgsfield.ai/mcp",
    args: "",
    allowedToolNames: "",
    writeAllowedToolNames: "",
    accessToken: "sbp_saved_token",
    principalId: "principal-1",
  });
  const before = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });
  assert.equal(before?.authMode, "static_env");
  assert.ok(before?.sealedOAuth);

  const result = await provisionAgentPluginMcpServers(deps, input);

  assert.deepEqual(result.alreadyProvisioned, ["remote"]);
  assert.deepEqual(await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" }), before);
});

test("T15: re-enabling preserves an operator-edited disabled connection and its OAuth tokens", async () => {
  const deps = makeDeps();
  const input = { workspaceId: "ws-1", pluginId: "some-plugin", principalId: "principal-1", servers: { remote: REMOTE_SERVER } };
  await provisionAgentPluginMcpServers(deps, input);
  // The operator changes the provisioned connection while leaving the plugin disabled.
  await saveExternalMcpServer(deps, {
    workspaceId: input.workspaceId, serverId: "remote", principalId: "operator-1",
    label: "My signed-in connection", transport: "streamable_http", authMode: "oauth", enabled: false,
    url: "https://operator.example.com/mcp", command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "",
    oauth: { grant: "authorization_code", clientId: "operator-client" },
  });
  const edited = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: "remote" });
  assert.ok(edited);
  assert.equal(edited.provisionedByPluginId, input.pluginId);
  const payload = { tokens: { accessToken: "fixture-access-token", refreshToken: "fixture-refresh-token", tokenType: "Bearer", scopes: [], expiresAt: null } };
  await deps.repo.upsert({ ...edited, ...await sealExternalMcpOAuthPayload(deps, edited, payload), oauthStatus: "connected" });
  const before = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: "remote" });
  assert.ok(before?.sealedOAuth);

  const result = await provisionAgentPluginMcpServers(deps, input);

  const after = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: "remote" });
  assert.deepEqual(after, before, "enabling must preserve the operator's URL, auth settings and sealed credentials");
  assert.ok(after);
  assert.deepEqual(await openExternalMcpOAuthPayload(deps.sealer, after), payload);
  assert.deepEqual(result.alreadyProvisioned, ["remote"]);
  assert.deepEqual(result.provisioned, []);
});

test("provisionAgentPluginMcpServers: the SAME plugin's row at an old url is left alone once it is enabled or has tools granted", async () => {
  for (const edit of [{ enabled: true }, { allowedToolNames: JSON.stringify(["search"]) }]) {
    const deps = makeDeps();
    const input = { workspaceId: "ws-1", pluginId: "some-plugin", principalId: "principal-1" };
    await provisionAgentPluginMcpServers(deps, { ...input, servers: { remote: REMOTE_SERVER } });
    const row = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });
    assert.ok(row);
    await deps.repo.upsert({ ...row, ...edit });
    const before = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });

    const result = await provisionAgentPluginMcpServers(deps, {
      ...input,
      servers: { remote: { ...REMOTE_SERVER, url: "https://mcp.example.com/mcp?v=2" } },
    });

    assert.deepEqual(result.alreadyProvisioned, ["remote"]);
    assert.deepEqual(await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" }), before);
  }
});

test("provisionAgentPluginMcpServers: an operator's pre-existing row with a live allowlist, write grants and OAuth tokens survives enabling completely untouched — only provisionedByPluginId changes", async () => {
  const deps = makeDeps();

  // Seed the row the way an operator's own Settings -> External MCP save would: a real allowlist, a
  // write grant, a pasted credential, and an oauth configuration — everything rule 1
  // exists to protect, and everything a careless upsert would wipe.
  await saveExternalMcpServer(deps, {
    workspaceId: "ws-1",
    serverId: "remote",
    label: "My Own Remote Connection",
    transport: "streamable_http",
    authMode: "oauth",
    enabled: true,
    command: "",
    url: "https://operator-configured.example.com/mcp",
    args: "",
    allowedToolNames: "search,fetch",
    writeAllowedToolNames: "search",
    env: "API_KEY=super-secret-value",
    oauth: { grant: "authorization_code", clientId: "operator-client" },
    principalId: "operator-1",
  });
  const seeded = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "remote" });
  assert.ok(seeded);
  // Seed completed sign-in state through the same sealer OAuth persistence uses, so adoption must
  // preserve usable access/refresh tokens and their AAD lineage, not just empty OAuth columns.
  const payload = {
    clientSecret: "fixture-client-secret",
    tokens: {
      accessToken: "fixture-oauth-access-token",
      refreshToken: "fixture-oauth-refresh-token",
      tokenType: "Bearer",
      scopes: ["search", "fetch"],
      expiresAt: "2026-10-08T00:00:00.000Z",
    },
  };
  await deps.repo.upsert({
    ...seeded,
    ...await sealExternalMcpOAuthPayload(deps, seeded, payload),
    oauthStatus: "connected",
    oauthExpiresAt: payload.tokens.expiresAt,
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
  assert.deepEqual(await openExternalMcpOAuthPayload(deps.sealer, after), payload);
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

test("provisionAgentPluginMcpServers: a different plugin declaring the same server key at a DIFFERENT endpoint is refused, never adopted or rebound", async () => {
  const deps = makeDeps();
  const first = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "plugin-a",
    servers: { main: REMOTE_SERVER },
    principalId: "principal-1",
  });
  assert.deepEqual(first.provisioned, ["main"]);

  // Same declared key ("main") derives the same unnamespaced connection id, but the endpoint is a
  // different server entirely. Adopting plugin A's row would label its provenance "plugin-b" while
  // calls for plugin B's `mcp__main__*` tools still reached plugin A's endpoint (finding 5-2).
  const result = await provisionAgentPluginMcpServers(deps, {
    workspaceId: "ws-1",
    pluginId: "plugin-b",
    servers: { main: { type: "streamable-http", url: "https://other.example.com/mcp" } },
    principalId: "principal-1",
  });

  assert.deepEqual(result.provisioned, []);
  assert.deepEqual(result.alreadyProvisioned, []);
  assert.deepEqual(result.adopted, []);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.serverKey, "main");
  assert.match(result.failed[0]?.reason ?? "", /different endpoint/);

  const after = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "main" });
  assert.ok(after);
  assert.equal(after.provisionedByPluginId, "plugin-a", "provenance is never rewritten for a colliding endpoint");
  assert.equal(after.url, "https://mcp.example.com/mcp", "the existing endpoint is not rebound to plugin B's declaration");
});

test("provisionAgentPluginMcpServers: a per-server existence-read rejection is reported and does not abort the remaining servers", async () => {
  const deps = makeDeps();
  const result = await provisionAgentPluginMcpServers(
    { ...deps, repo: repoWhoseLookupRejects(deps.repo, "alpha", new Error("transient lookup failure")) },
    {
      workspaceId: "ws-1",
      pluginId: "some-plugin",
      // Two servers in one plugin: the first lookup rejects, the second must still be provisioned.
      servers: { alpha: REMOTE_SERVER, beta: REMOTE_SERVER },
      principalId: "principal-1",
    },
  );

  assert.deepEqual(result.provisioned, ["beta"], "a rejected lookup for alpha must not stop beta from being created");
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.serverKey, "alpha");
  assert.match(result.failed[0]?.reason ?? "", /transient lookup failure/);

  const views = await listExternalMcpServerViews({ repo: deps.repo }, "ws-1");
  assert.equal(views.length, 1);
  assert.equal(views[0]?.serverId, "beta");
});

// L025a: one loop must preserve each outcome and its order after extracting the write boundary.
test("provisioning reports created, recognized, adopted, refused, and failed servers independently", async (t) => {
  const deps = makeDeps();
  const input = { workspaceId: "ws-mixed", pluginId: "owner", principalId: "principal", servers: { recognized: REMOTE_SERVER, adopted: REMOTE_SERVER, refused: REMOTE_SERVER } };
  await provisionAgentPluginMcpServers(deps, input);
  const adopted = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: "adopted" });
  const refused = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: "refused" });
  assert.ok(adopted && refused);
  await deps.repo.upsert({ ...adopted, provisionedByPluginId: null });
  await deps.repo.upsert({ ...refused, provisionedByPluginId: "other", url: "https://other.example/mcp" });
  const write = deps.repo.upsert.bind(deps.repo);
  t.mock.method(deps.repo, "upsert", async (record: Parameters<typeof write>[0]) => {
    if (record.serverId === "broken") throw new Error("write unavailable");
    return write(record);
  });
  const result = await provisionAgentPluginMcpServers(deps, { ...input, servers: { ...input.servers, broken: REMOTE_SERVER, created: REMOTE_SERVER, local: STDIO_SERVER } });
  assert.deepEqual(result.provisioned, ["created"]);
  assert.deepEqual(result.alreadyProvisioned, ["recognized"]);
  assert.deepEqual(result.adopted, ["adopted"]);
  assert.deepEqual(result.failed.map(({ serverKey }) => serverKey), ["refused", "broken"]);
  assert.match(result.failed[0]!.reason, /refusing to rebind/);
  assert.equal(result.failed[1]!.reason, "write unavailable");
  assert.deepEqual(result.skipped.map(({ serverKey }) => serverKey), ["local"]);
});

for (const failure of [new Error("adoption unavailable"), "adoption unavailable"]) {
  test(`provisioning isolates adoption write failure (${typeof failure}) and continues`, async (t) => {
    const deps = makeDeps();
    const input = { workspaceId: "ws-adoption", pluginId: "original", principalId: "principal", servers: { existing: REMOTE_SERVER } };
    await provisionAgentPluginMcpServers(deps, input);
    const before = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: "existing" });
    const write = deps.repo.upsert.bind(deps.repo);
    t.mock.method(deps.repo, "upsert", async (record: Parameters<typeof write>[0]) => {
      if (record.serverId === "existing") throw failure;
      return write(record);
    });
    const result = await provisionAgentPluginMcpServers(deps, { ...input, pluginId: "new-owner", servers: { existing: REMOTE_SERVER, later: REMOTE_SERVER } });
    assert.deepEqual(result.failed, [{ serverKey: "existing", reason: "adoption unavailable" }]);
    assert.deepEqual(result.provisioned, ["later"]);
    assert.deepEqual(result.adopted, []);
    assert.deepEqual(await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: "existing" }), before);
  });
}

/** Installs one plugin package from in-memory files through the real install pipeline. */
async function installMcpPlugin(workspaceId: string, pluginId: string, mcpServers: Record<string, unknown>, pluginExtensions?: Record<string, unknown>) {
  const files = {
    "plugin.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: pluginId, version: "1.0.0", ...(pluginExtensions ? { extensions: pluginExtensions } : {}) }),
    "mcp.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers }),
  };
  const archive = Buffer.from(JSON.stringify(files));
  return installAgentPlugin({ layout: resolveAgentPluginLayout(), workspaceId, archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader: {
    async *entries() {
      for (const [entryPath, text] of Object.entries(files)) {
        const bytes = Buffer.from(text);
        yield { kind: "file" as const, entryPath, declaredSize: bytes.length, executable: false, async *openReadStream() { yield bytes; } };
      }
    },
  } });
}

async function withPluginsDir(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-mcp-bundled-only-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("planAgentPluginMcpFederation: a remote server the trust rule does not auto-admit is skipped, never planned", () => {
  const seen: string[] = [];
  const plan = planAgentPluginMcpFederation({ servers: { main: REMOTE_SERVER, stdio: STDIO_SERVER } }, {
    classifyTrust: (server) => { seen.push(server.type); return "requires-confirmation"; },
  });
  assert.deepEqual(plan.toUpsert, []);
  assert.deepEqual(plan.skipped.map(s => s.serverKey), ["main", "stdio"]);
  assert.match(plan.skipped[0]?.reason ?? "", /trust classification is not 'auto-admit'/);
  assert.match(plan.skipped[1]?.reason ?? "", /'stdio' local process/);
  assert.deepEqual(seen, ["streamable-http"], "stdio is narrowed away before the trust rule is consulted");
});

test("planAgentPluginMcpFederation: a server key with no usable characters is skipped with a reason", () => {
  const plan = planAgentPluginMcpFederation({ servers: { "!!!": REMOTE_SERVER } });
  assert.deepEqual(plan.toUpsert, []);
  assert.deepEqual(plan.skipped, [{ serverKey: "!!!", reason: "server key '!!!' has no valid characters to derive a connection id from" }]);
});

test("resolveAgentPluginMcpServers bundledOnly: only the exact build-seeded digest supplies servers", async () => {
  await withPluginsDir(async () => {
    const layout = resolveAgentPluginLayout();
    const resolve = (workspaceId: string, pluginId: string) => resolveAgentPluginMcpServers(testSiteLayoutContext({ workspaceId, pluginId, bundledOnly: true }));
    // Installed but never seeded by the build: no read trust source.
    await installMcpPlugin("ws-installed", "widget", { main: REMOTE_SERVER });
    assert.deepEqual(await resolve("ws-installed", "widget"), {});
    // Seeded digest recorded, but that package is not installed in this workspace.
    await mkdir(layout.forWorkspace("ws-missing").root, { recursive: true });
    await recordBundledAgentPluginDigests({ workspaceRoot: layout.forWorkspace("ws-missing").root, seeded: [{ pluginId: "widget", archiveDigest: "0".repeat(64) }] });
    assert.deepEqual(await resolve("ws-missing", "widget"), {});
    // Seeded and installed: the declared servers come back.
    const seeded = await installMcpPlugin("ws-seeded", "widget", { main: REMOTE_SERVER });
    await recordBundledAgentPluginDigests({ workspaceRoot: layout.forWorkspace("ws-seeded").root, seeded: [{ pluginId: "widget", archiveDigest: seeded.archiveDigest }] });
    assert.deepEqual({ ...await resolve("ws-seeded", "widget") }, { main: REMOTE_SERVER });
  });
});

test("resolveAgentPluginReadOnlyRemoteNames: a bundled plugin's reviewed read names for its exact endpoint; nothing otherwise", async () => {
  await withPluginsDir(async () => {
    const layout = resolveAgentPluginLayout();
    const read = (workspaceId: string, url: string) => resolveAgentPluginReadOnlyRemoteNames({ agentPluginLayout: layout, workspaceId, pluginId: "widget", serverId: "main", url });
    const extensions = { tovu: { mcpServers: { main: { tovuDefaultTools: { write: [], read: ["list_things"] } } } } };
    const seeded = await installMcpPlugin("ws-1", "widget", { main: REMOTE_SERVER }, extensions);
    await recordBundledAgentPluginDigests({ workspaceRoot: layout.forWorkspace("ws-1").root, seeded: [{ pluginId: "widget", archiveDigest: seeded.archiveDigest }] });
    assert.deepEqual([...await read("ws-1", "https://mcp.example.com/mcp")], ["list_things"]);
    assert.deepEqual([...await read("ws-1", "https://moved.example.com/mcp")], [], "an edited endpoint never inherits read trust");
    await installMcpPlugin("ws-2", "widget", { main: REMOTE_SERVER }, extensions);
    assert.deepEqual([...await read("ws-2", "https://mcp.example.com/mcp")], [], "an arbitrary install is never a read-trust source");
  });
});

test("findAgentPluginMcpServerDefaults matches stored identity and exact endpoint only", () => {
  const defaults = { write: ["create_thing"], read: ["list_things"] };
  const servers: Record<string, McpServerConfig> = {
    helper: STDIO_SERVER,
    "Main Server": { ...REMOTE_SERVER, tovuDefaultTools: defaults },
    plain: REMOTE_SERVER,
  };
  assert.deepEqual(findAgentPluginMcpServerDefaults(servers, { serverId: "main-server", url: REMOTE_SERVER.url }), defaults);
  assert.equal(findAgentPluginMcpServerDefaults(servers, { serverId: "main-server", url: "https://elsewhere.example/mcp" }), null);
  assert.equal(findAgentPluginMcpServerDefaults(servers, { serverId: "plain", url: REMOTE_SERVER.url }), null, "a match that declares no defaults");
  assert.equal(findAgentPluginMcpServerDefaults(servers, { serverId: "helper", url: null }), null, "stdio never supplies defaults");
  assert.equal(findAgentPluginMcpServerDefaults(servers, { serverId: "unknown", url: REMOTE_SERVER.url }), null);
});

test("isEmptyJsonList treats null, blank, non-array and unreadable lists as empty", () => {
  for (const raw of [null, "", "[]", "{}", "\"text\"", "not json"]) assert.equal(isEmptyJsonList(raw), true, String(raw));
  assert.equal(isEmptyJsonList('["list_things"]'), false);
});

test("provisionAgentPluginMcpServers: a refused rebind of a plugin-owned row with no stored url names an empty url", async () => {
  const deps = makeDeps();
  await provisionAgentPluginMcpServers(deps, { workspaceId: "ws-1", pluginId: "plugin-a", servers: { main: REMOTE_SERVER }, principalId: "principal-1" });
  const row = await deps.repo.findByServerId({ workspaceId: "ws-1", serverId: "main" });
  assert.ok(row);
  await deps.repo.upsert({ ...row, url: null });
  const result = await provisionAgentPluginMcpServers(deps, { workspaceId: "ws-1", pluginId: "plugin-b", servers: { main: REMOTE_SERVER }, principalId: "principal-1" });
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0]?.reason ?? "", /owned by plugin 'plugin-a' at a different endpoint \(url='',/);
});
