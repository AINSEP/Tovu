import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmission, ToolExecutionContext } from "@jini-ai/core";

import {
  InMemoryExternalMcpServerRepo,
  type ExternalMcpOAuthService,
  type ExternalMcpServerRecord,
} from "#src/assistant/index";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import { runAgentPluginConnect, type AgentPluginConnectToolDeps } from "../../connect-tool.js";
import type { McpServerConfig } from "../../manifest.js";

/**
 * @file `agent_plugin_connect`'s RED coverage for S-G1 (2026-09-27 Supabase-agent-plugin v2 plan,
 * section 6). Uses the same real in-memory external-mcp store stack `federate-mcp.unit.test.ts`
 * builds (`InMemoryExternalMcpServerRepo`/`InMemoryKeyring`/`AesGcmSecretSealer`) so provisioning
 * and polling both exercise the real store, not a mock. `resolveInstalledPlugin` is injected — see
 * `connect-tool.ts`'s own doc — so this needs no real on-disk plugin install.
 */

const WORKSPACE_ID = "77777777-7777-4777-8777-777777777777";
const PRINCIPAL_ID = "principal-1";
const CLOCK = { nowIso: () => "2026-09-27T00:00:00.000Z" };

const OAUTH_SERVER: McpServerConfig = { type: "streamable-http", url: "https://mcp.example.com/mcp", tovuAuthMode: "oauth" };

function makeStoreDeps() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return { repo, keyring, sealer, clock: CLOCK };
}

function fakeOAuth(repo: InMemoryExternalMcpServerRepo, authorizationUrl: string): ExternalMcpOAuthService {
  return {
    async beginConnect({ serverId }) {
      const existing = await repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId });
      if (existing) await repo.upsert({ ...existing, oauthStatus: "pending" });
      return { kind: "redirect_required", authorizationUrl, expiresAt: "2026-09-27T00:10:00.000Z" };
    },
    async completeAuthorizationCallback() {
      throw new Error("not used by this test");
    },
    async pollDeviceAuthorization() {
      throw new Error("not used by this test");
    },
  };
}

async function flipRowConnected(repo: InMemoryExternalMcpServerRepo, serverId: string): Promise<void> {
  const row = (await repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId })) as ExternalMcpServerRecord;
  await repo.upsert({ ...row, oauthStatus: "connected" });
}

function fakeCtx(emissions: SurfaceEmission[], signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: { pluginId: "widget-store" },
    signal,
    emitSurface: async (emission: SurfaceEmission) => {
      emissions.push(emission);
    },
  } as unknown as ToolExecutionContext;
}

function htmlOf(emission: SurfaceEmission): string {
  return (emission as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
}

test("agent_plugin_connect: a bundled plugin with one OAuth server shows exactly one https sign-in link and no token", async () => {
  const store = makeStoreDeps();
  const oauth = fakeOAuth(store.repo, "https://mcp.example.com/authorize?state=abc123");
  const surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() };
  const emissions: SurfaceEmission[] = [];
  const ctx = fakeCtx(emissions);

  const deps: AgentPluginConnectToolDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    clock: CLOCK,
    externalMcpServerRepo: store.repo,
    siteAssistantSecretSealer: store.sealer,
    siteAssistantSecretKeyring: store.keyring,
    externalMcpOAuth: oauth,
    pollIntervalMs: 5,
    waitTimeoutMs: 30,
    resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }),
  };

  const result = await runAgentPluginConnect(deps, surfaces, ctx, "widget-store");
  assert.deepEqual(result, { status: "waiting-for-sign-in" });
  assert.equal(emissions.length, 1, "exactly one card sent while nobody has signed in yet");

  const html = htmlOf(emissions[0]!);
  const linkMatches = html.match(/https:\/\/[^"'\\]+/g) ?? [];
  assert.equal(linkMatches.length, 1, `expected exactly one https link in the card, got: ${JSON.stringify(linkMatches)}`);
  assert.equal(linkMatches[0], "https://mcp.example.com/authorize?state=abc123");
  // Visible copy only: the shared bridge script and stylesheet are not what the human reads.
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  assert.doesNotMatch(visible.toLowerCase(), /token/, "the card must never mention a token");
});

test("agent_plugin_connect: a fake callback flipping the row to connected resolves { status: 'connected' }", async () => {
  const store = makeStoreDeps();
  const oauth = fakeOAuth(store.repo, "https://mcp.example.com/authorize?state=xyz789");
  const surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() };
  const emissions: SurfaceEmission[] = [];
  const ctx = fakeCtx(emissions);

  const deps: AgentPluginConnectToolDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    clock: CLOCK,
    externalMcpServerRepo: store.repo,
    siteAssistantSecretSealer: store.sealer,
    siteAssistantSecretKeyring: store.keyring,
    externalMcpOAuth: oauth,
    pollIntervalMs: 5,
    waitTimeoutMs: 2000,
    resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }),
  };

  const connectPromise = runAgentPluginConnect(deps, surfaces, ctx, "widget-store");

  // Give the handler time to provision the row and call beginConnect (which writes "pending")
  // before the "fake callback" flips it — mirrors a browser landing on the real OAuth callback
  // route while this call is mid-poll.
  setTimeout(() => {
    flipRowConnected(store.repo, "widget").catch(() => {});
  }, 15);

  const result = await connectPromise;
  assert.deepEqual(result, { status: "connected" });
  assert.equal(emissions.length, 2, "the waiting card, then the connected card");
  assert.match(htmlOf(emissions[1]!), /Connected/);
});

test("agent_plugin_connect: a plugin with no OAuth server is refused", async () => {
  const store = makeStoreDeps();
  const surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() };
  const ctx = fakeCtx([]);

  const deps: AgentPluginConnectToolDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    clock: CLOCK,
    externalMcpServerRepo: store.repo,
    siteAssistantSecretSealer: store.sealer,
    siteAssistantSecretKeyring: store.keyring,
    resolveInstalledPlugin: async () => ({ servers: { plain: { type: "streamable-http", url: "https://example.com/mcp" } } }),
  };

  await assert.rejects(runAgentPluginConnect(deps, surfaces, ctx, "widget-store"), /declares no OAuth-authenticated MCP server/);
});

function baseDeps(store: ReturnType<typeof makeStoreDeps>, overrides: Partial<AgentPluginConnectToolDeps>): AgentPluginConnectToolDeps {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "test" }),
    clock: CLOCK,
    externalMcpServerRepo: store.repo,
    siteAssistantSecretSealer: store.sealer,
    siteAssistantSecretKeyring: store.keyring,
    pollIntervalMs: 5,
    waitTimeoutMs: 30,
    ...overrides,
  } as AgentPluginConnectToolDeps;
}

test("agent_plugin_connect: an OAuth server provisioning skipped (legacy sse) is refused before any sign-in starts", async () => {
  const store = makeStoreDeps();
  let beginCalls = 0;
  const oauth = fakeOAuth(store.repo, "https://mcp.example.com/authorize");
  const counting: ExternalMcpOAuthService = { ...oauth, beginConnect: async (input) => { beginCalls += 1; return oauth.beginConnect(input); } };
  const emissions: SurfaceEmission[] = [];
  const deps = baseDeps(store, {
    externalMcpOAuth: counting,
    resolveInstalledPlugin: async () => ({ servers: { widget: { type: "sse", url: "https://mcp.example.com/sse", tovuAuthMode: "oauth" } } }),
  });

  await assert.rejects(
    runAgentPluginConnect(deps, { surfaceExchanges: createSurfaceExchangeStore() }, fakeCtx(emissions), "widget-store"),
    /could not be set up/,
  );
  assert.equal(beginCalls, 0, "no sign-in is started for a connection that was never provisioned");
  assert.equal(emissions.length, 0);
});

test("agent_plugin_connect: a device-code grant is refused rather than showing a link with no code", async () => {
  const store = makeStoreDeps();
  const emissions: SurfaceEmission[] = [];
  const deviceOAuth: ExternalMcpOAuthService = {
    ...fakeOAuth(store.repo, "unused"),
    async beginConnect() {
      return {
        kind: "device_code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://example.com/device",
        verificationUriComplete: null,
        expiresAt: "2026-09-27T00:10:00.000Z",
        intervalSeconds: 5,
      };
    },
  };
  const deps = baseDeps(store, { externalMcpOAuth: deviceOAuth, resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }) });

  await assert.rejects(
    runAgentPluginConnect(deps, { surfaceExchanges: createSurfaceExchangeStore() }, fakeCtx(emissions), "widget-store"),
    /device_code/,
  );
  assert.equal(emissions.length, 0, "no card with an unusable link");
});

test("agent_plugin_connect: a failed 'connected' card update never turns a real connection into a tool failure", async () => {
  const store = makeStoreDeps();
  let sends = 0;
  const ctx = {
    ...fakeCtx([]),
    emitSurface: async () => {
      sends += 1;
      if (sends === 2) throw new Error("transport closed");
      await flipRowConnected(store.repo, "widget");
    },
  } as unknown as ToolExecutionContext;
  const deps = baseDeps(store, {
    externalMcpOAuth: fakeOAuth(store.repo, "https://mcp.example.com/authorize"),
    waitTimeoutMs: 2000,
    resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }),
  });

  const result = await runAgentPluginConnect(deps, { surfaceExchanges: createSurfaceExchangeStore() }, ctx, "widget-store");
  assert.deepEqual(result, { status: "connected" });
});
