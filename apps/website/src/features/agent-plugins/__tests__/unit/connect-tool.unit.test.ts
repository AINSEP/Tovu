import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { forceRemove } from "../fixtures/force-remove.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";
import { resolveAgentPluginLayout } from "../../layout.js";

import type { SurfaceEmission, ToolExecutionContext } from "@jini-ai/core";

import {
  InMemoryExternalMcpServerRepo,
  saveExternalMcpServer,
  type ExternalMcpOAuthService,
  type ExternalMcpServerRecord,
} from "#src/assistant/index";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

import { runAgentPluginConnect as runConnectWithOptions, type AgentPluginConnectToolDeps } from "../../connect-tool.js";
import { provisionAgentPluginMcpServers } from "../../federate-mcp.js";
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
const CLOCK = { nowMs: () => Date.parse("2026-09-27T00:00:00.000Z"), nowIso: () => "2026-09-27T00:00:00.000Z" };

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

test("agent_plugin_connect: a bundled plugin with one OAuth server shows exactly one https sign-in link and no token", async (t) => {
  const store = makeStoreDeps();
  const previousOrigin = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "https://public.example/site-path";
  t.after(() => { if (previousOrigin === undefined) delete process.env.TOVU_PUBLIC_URL; else process.env.TOVU_PUBLIC_URL = previousOrigin; });
  const originalOAuth = fakeOAuth(store.repo, "https://mcp.example.com/authorize?state=abc123");
  const beginInputs: unknown[] = [];
  const oauth: ExternalMcpOAuthService = { ...originalOAuth, beginConnect: async input => { beginInputs.push(input); return originalOAuth.beginConnect(input); } };
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
  assert.deepEqual(beginInputs, [{ serverId: "widget", redirectUri: "https://public.example/api/mcp-servers/oauth/callback/widget" }]);
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
  const originalOAuth = fakeOAuth(store.repo, "https://mcp.example.com/authorize?state=xyz789");
  let began!: () => void;
  const begun = new Promise<void>(resolve => { began = resolve; });
  const oauth: ExternalMcpOAuthService = { ...originalOAuth, beginConnect: async input => {
    const result = await originalOAuth.beginConnect(input);
    began();
    return result;
  } };
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

  await begun;
  await flipRowConnected(store.repo, "widget");

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

for (const guard of ["unknown-plugin", "two-servers", "no-oauth", "no-surface"] as const) {
  test(`agent_plugin_connect: refuses ${guard} before starting sign-in`, async () => {
    const store = makeStoreDeps();
    const emissions: SurfaceEmission[] = [];
    let beginCalls = 0;
    const oauth = fakeOAuth(store.repo, "https://mcp.example.com/authorize");
    const deps = baseDeps(store, {
      externalMcpOAuth: guard === "no-oauth" ? undefined : {
        ...oauth, beginConnect: async (input) => { beginCalls += 1; return oauth.beginConnect(input); },
      },
      resolveInstalledPlugin: async () => guard === "unknown-plugin" ? null : {
        servers: guard === "two-servers" ? { widget: OAUTH_SERVER, other: OAUTH_SERVER } : { widget: OAUTH_SERVER },
      },
    });
    const ctx = guard === "no-surface"
      ? { ...fakeCtx(emissions), emitSurface: undefined } as unknown as ToolExecutionContext
      : fakeCtx(emissions);
    const expected = {
      "unknown-plugin": "agent_plugin_connect: 'widget-store' is not an installed Agent Plugin in this workspace.",
      "two-servers": "agent_plugin_connect: 'widget-store' declares 2 unconnected OAuth servers (widget, other) — connect them one at a time.",
      "no-oauth": "agent_plugin_connect: no OAuth service is wired for this composition root — nothing can be connected here.",
      "no-surface": "agent_plugin_connect: this execution context has no interactive channel (no emitSurface), so no sign-in card can be shown.",
    }[guard];
    await assert.rejects(runAgentPluginConnect(deps, { surfaceExchanges: createSurfaceExchangeStore() }, ctx, "widget-store"), { message: expected });
    assert.equal(beginCalls, 0);
    assert.deepEqual(emissions, []);
  });
}

test("agent_plugin_connect: abort closes the exchange and returns waiting", async () => {
  const store = makeStoreDeps();
  const controller = new AbortController();
  const exchanges = createSurfaceExchangeStore();
  const emissions: SurfaceEmission[] = [];
  const ctx = {
    ...fakeCtx(emissions, controller.signal),
    emitSurface: async (emission: SurfaceEmission) => {
      emissions.push(emission);
      assert.equal(exchanges.size(), 1);
      controller.abort();
      assert.equal(exchanges.size(), 0, "abort must close the pending exchange immediately");
    },
  } as unknown as ToolExecutionContext;
  const result = await runAgentPluginConnect(baseDeps(store, {
    externalMcpOAuth: fakeOAuth(store.repo, "https://mcp.example.com/authorize"),
    resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }),
  }), { surfaceExchanges: exchanges }, ctx, "widget-store");
  assert.deepEqual(result, { status: "waiting-for-sign-in" });
  assert.equal(emissions.length, 1);
  assert.equal(exchanges.size(), 0);
});

test("agent_plugin_connect: denied permission provisions no row and emits no card", async () => {
  const store = makeStoreDeps();
  const emissions: SurfaceEmission[] = [];
  const deps = baseDeps(store, {
    authorize: async () => ({ allowed: false, reason: "test denial" }),
    externalMcpOAuth: fakeOAuth(store.repo, "https://mcp.example.com/authorize"),
    resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }),
  });
  await assert.rejects(runAgentPluginConnect(deps, { surfaceExchanges: createSurfaceExchangeStore() }, fakeCtx(emissions), "widget-store"), /not authorized.*test denial/);
  assert.deepEqual(await store.repo.listByWorkspaceId(WORKSPACE_ID), []);
  assert.deepEqual(emissions, []);
});

for (const credential of ["oauth", "static-token"] as const) {
  test(`agent_plugin_connect: an already saved ${credential} starts no sign-in and preserves the row`, async () => {
    const store = makeStoreDeps();
    const server: McpServerConfig = { ...OAUTH_SERVER, tovuTokenAuth: { helpUrl: "https://mcp.example.com/tokens" } };
    await provisionAgentPluginMcpServers(store, { workspaceId: WORKSPACE_ID, pluginId: "widget-store", servers: { widget: server }, principalId: PRINCIPAL_ID });
    const row = (await store.repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: "widget" }))!;
    if (credential === "oauth") {
      await store.repo.upsert({ ...row, oauthStatus: "connected" });
    } else {
      await saveExternalMcpServer(store, {
        workspaceId: WORKSPACE_ID, serverId: "widget", transport: "streamable_http", authMode: "static_env",
        enabled: false, command: "", url: OAUTH_SERVER.url, args: "", allowedToolNames: "", writeAllowedToolNames: "",
        accessToken: "saved-fake-access-token", principalId: PRINCIPAL_ID,
      });
    }
    const saved = (await store.repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: "widget" }))!;
    let beginCalls = 0;
    const oauth = fakeOAuth(store.repo, "https://mcp.example.com/authorize");
    const emissions: SurfaceEmission[] = [];
    const result = await runAgentPluginConnect(baseDeps(store, {
      externalMcpOAuth: { ...oauth, beginConnect: async (input) => { beginCalls += 1; return oauth.beginConnect(input); } },
      resolveInstalledPlugin: async () => ({ servers: { widget: server } }),
    }), { surfaceExchanges: createSurfaceExchangeStore() }, fakeCtx(emissions), "widget-store");
    assert.deepEqual(result, { status: "connected" });
    assert.equal(beginCalls, 0);
    assert.deepEqual(emissions, []);
    assert.deepEqual(await store.repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: "widget" }), saved);
  });
}


test("agent_plugin_connect resolves the installed package without an injected resolver", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "connect-installed-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    await seedBundledAgentPlugins({ layout: resolveAgentPluginLayout(), workspaceId: WORKSPACE_ID, sourceRoot: path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins") });
    const store = makeStoreDeps();
    const emissions: SurfaceEmission[] = [];
    const result = await runAgentPluginConnect(baseDeps(store, {
      externalMcpOAuth: fakeOAuth(store.repo, "https://mcp.supabase.com/authorize"),
    }), { surfaceExchanges: createSurfaceExchangeStore() }, fakeCtx(emissions), "supabase");
    assert.deepEqual(result, { status: "waiting-for-sign-in" });
    const row = await store.repo.findByServerId({ workspaceId: WORKSPACE_ID, serverId: "supabase" });
    assert.ok(row);
    assert.equal(row.provisionedByPluginId, "supabase");
    assert.match(row.url ?? "", /^https:\/\/mcp\.supabase\.com\/mcp/);
    assert.equal(row.oauthStatus, "pending");
    assert.equal(emissions.length, 1);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
});

test("agent_plugin_connect aborts during the polling sleep and cleans up promptly", { timeout: 2_000 }, async () => {
  const store = makeStoreDeps();
  const controller = new AbortController();
  const exchanges = createSurfaceExchangeStore();
  let polled!: () => void;
  const polling = new Promise<void>(resolve => { polled = resolve; });
  const find = store.repo.findByServerId.bind(store.repo);
  let cardSent = false;
  store.repo.findByServerId = async input => {
    const row = await find(input);
    if (cardSent) polled();
    return row;
  };
  const ctx = { ...fakeCtx([], controller.signal), emitSurface: async () => { cardSent = true; } } as unknown as ToolExecutionContext;
  const pending = runAgentPluginConnect(baseDeps(store, {
    pollIntervalMs: 60_000, waitTimeoutMs: 60_000,
    externalMcpOAuth: fakeOAuth(store.repo, "https://mcp.example.com/authorize"),
    resolveInstalledPlugin: async () => ({ servers: { widget: OAUTH_SERVER } }),
  }), { surfaceExchanges: exchanges }, ctx, "widget-store");
  await polling;
  await new Promise<void>(resolve => setImmediate(resolve));
  controller.abort();
  assert.equal(exchanges.size(), 0);
  assert.deepEqual(await pending, { status: "waiting-for-sign-in" });
  assert.equal(exchanges.size(), 0);
});

/** Moves the test context emitter into the host helper’s optional execution ports. */
function runAgentPluginConnect(
  deps: Parameters<typeof runConnectWithOptions>[0],
  surfaces: Parameters<typeof runConnectWithOptions>[1],
  context: ToolExecutionContext & { emitSurface?: import("@jini-ai/core").SurfaceEmitter },
  pluginId: string,
) {
  const { emitSurface, ...required } = context;
  return runConnectWithOptions(deps, surfaces, required, pluginId, emitSurface ? { emitSurface } : {});
}
