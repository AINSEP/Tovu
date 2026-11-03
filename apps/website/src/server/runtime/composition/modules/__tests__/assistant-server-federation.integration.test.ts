import assert from "node:assert/strict";
import childProcess from "node:child_process";
import test from "node:test";
import { InMemoryMcpSession } from "#src/assistant/mcp-federation/adapter.memory";
import { createAssistantServerFederation } from "../assistant-server-federation.js";
import { notifyExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests } from "#src/assistant/external-mcp-roster-change";
import { isAssistantDaemonReady, resetAssistantDaemonSingletonForTests } from "#src/server/runtime/lifecycle/daemon-supervisor";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService } from "#src/features/external-mcp/external-mcp-oauth";
import { createTovuOAuthGuard } from "#src/platform/oauth/endpoint-safety";
import { serverFederationFixture } from "./helpers/server-federation-fixture.js";

test.beforeEach(() => { resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests(); });
test.afterEach(() => { resetExternalMcpRosterChangeListenersForTests(); resetAssistantDaemonSingletonForTests(); });

test("daemon catalog demand admits server federation before returning remote tool descriptors", async t => {
  const fixture = serverFederationFixture({ connect: async () => new InMemoryMcpSession({ tools: [
    { name: "echo", description: "Echo", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  ] }) });
  await fixture.save();
  const { default: express } = await import("express");
  const { createAssistantByokModule } = await import("../assistant-byok.js");
  const { ensureToolExecToken } = await import("#src/assistant/daemon-access");
  const { acceptToolRun } = await import("./assistant-tool-exec.fixture.js");
  const { startTestServer } = await import("#src/server/__tests__/helpers/http-test-server");
  await acceptToolRun({ deps: fixture.deps, runId: "catalog-demand", principalId: "owner" });
  const module = createAssistantByokModule(fixture.deps, fixture.surface);
  const app = express();
  module.registerToolExecRoutes({ router: app });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/internal/tool-catalog?runId=catalog-demand&principalId=owner`, { headers: { authorization: `Bearer ${ensureToolExecToken({}, {})}` } });
  assert.equal(response.status, 200);
  assert.ok(((await response.json()) as { tools: { id: string }[] }).tools.some(tool => tool.id === "mcp__hosted__echo"));
});

test("native site tools stay available while an optional MCP server is still connecting", async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const connecting = new Promise<void>(resolve => { entered = resolve; });
  const fixture = serverFederationFixture({ connect: async () => {
    entered(); await held;
    return new InMemoryMcpSession({ tools: [{ name: 'echo', inputSchema: { type: 'object' } }] });
  } });
  await fixture.save();
  const nativeTools = await fixture.surface.daemonCalls.listToolsFor({ principalId: 'owner' });
  assert.ok(nativeTools.length > 0, 'the server fixture must have native tools before optional federation starts');
  const runtime = createAssistantServerFederation({ toolSurface: fixture.surface }, {});
  let served = false;
  const catalog = runtime.daemonCalls.listToolsFor({ principalId: 'owner' }).then(tools => { served = true; return tools; });
  try {
    await connecting;
    t.mock.timers.tick(5_000);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(served, true, 'native catalog must answer within five seconds, below the daemon\'s fifteen-second deadline');
    const tools = await catalog;
    assert.ok(tools.some(tool => tool.id === nativeTools[0]!.id), 'the real native tool catalog must be served');
    assert.ok(!tools.some(tool => tool.id === 'mcp__hosted__echo'));
  } finally {
    release();
    await fixture.surface.readFederationAdmissions({}, {});
    await catalog;
  }
  const refreshed = await runtime.daemonCalls.listToolsFor({ principalId: 'owner' });
  assert.ok(refreshed.some(tool => tool.id === 'mcp__hosted__echo'), 'late admissions must appear on subsequent catalog reads');
});

test("a remote tool's Allow for this chat survives the move to the server and stays conversation scoped", { timeout: 5000 }, async t => {
  const session = new InMemoryMcpSession({ tools: [{ name: "assistant_set_instructions", description: "Change assistant instructions",
    inputSchema: { type: "object", properties: { name: { type: "string" } } }, annotations: { readOnlyHint: false } }] });
  const fixture = serverFederationFixture({ connect: async () => session });
  await fixture.save({ toolName: "assistant_set_instructions" });
  const { default: express } = await import("express");
  const { createAssistantByokModule } = await import("../assistant-byok.js");
  const { ensureToolExecToken } = await import("#src/assistant/daemon-access");
  const { createRemoteToolExecutor } = await import("@jini-ai/daemon");
  const { acceptToolRun } = await import("./assistant-tool-exec.fixture.js");
  const { startTestServer } = await import("#src/server/__tests__/helpers/http-test-server");
  await acceptToolRun({ deps: fixture.deps, runId: "remembered-run", principalId: "owner" });
  const module = createAssistantByokModule(fixture.deps, undefined, { federationConnect: async () => session });
  const app = express();
  module.registerToolExecRoutes({ router: app });
  const baseUrl = await startTestServer(app, t);
  let conversationId = "chat-remembered-run";
  const remote = createRemoteToolExecutor({ baseUrl, token: ensureToolExecToken({}, {}) }, { contextFor: () => ({ conversationId }) });
  const toolId = "mcp__hosted__assistant_set_instructions";
  const call = { principal: { id: "owner" }, run: { id: "remembered-run" }, toolId, input: { name: "one" } };
  let cards = 0;
  const first = await remote.execute(call, { emitSurface: async emission => {
    if (emission.channel !== "mcp-ui") return;
    cards++;
    assert.match(JSON.stringify(emission), /Allow for this chat/);
    const exchangeId = module.toolSurface.surfaceExchanges.findTypedAnswerTarget({ principalId: "owner", toolId });
    assert.ok(exchangeId);
    assert.deepEqual(module.toolSurface.surfaceExchanges.deliver({ exchangeId, principalId: "owner", params: { decision: "confirm", choice: "chat" } }, { toolId }), { ok: true });
  } });
  assert.equal(first.status, "completed");
  assert.equal((await remote.execute(call, { emitSurface: async () => { assert.fail("the same chat must reuse its recorded approval"); } })).status, "completed");
  assert.equal(cards, 1);
  conversationId = "another-chat";
  await remote.execute(call, { emitSurface: async emission => {
    if (emission.channel !== "mcp-ui") return;
    cards++;
    const exchangeId = module.toolSurface.surfaceExchanges.findTypedAnswerTarget({ principalId: "owner", toolId });
    assert.ok(exchangeId);
    module.toolSurface.surfaceExchanges.deliver({ exchangeId, principalId: "owner", params: { decision: "cancel" } }, { toolId });
  } });
  assert.equal(cards, 2, "a different conversation must ask again");
  assert.equal(session.calls.length, 2, "only the two approved calls may reach the external service");
});

test("OAuth reauthentication and tool execution work with daemon stopped", async t => {
  let spawns = 0;
  t.mock.method(childProcess, "spawn", () => { spawns++; throw new Error("the daemon must stay stopped"); });
  const session = new InMemoryMcpSession({ tools: [{ name: "echo", description: "Echo a message", inputSchema: { type: "object" } }] });
  let tokenRequests = 0;
  const tokens: string[] = [];
  const fixture = serverFederationFixture({ connect: async connection => {
    tokens.push("headers" in connection.launch ? connection.launch.headers.authorization ?? "" : "");
    return session;
  }, oauthFor: deps => createExternalMcpOAuthService({ workspaceId: deps.workspaceId,
    repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, {}), fetchFn: async () => {
      tokenRequests++;
      return new Response(JSON.stringify({ access_token: "reconnected-token", token_type: "Bearer", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } });
    } },
    onConnected: async () => notifyExternalMcpRosterChanged(),
  }) });
  const { deps, surface } = fixture;
  const runtime = createAssistantServerFederation({ toolSurface: surface }, {});
  runtime.registerRosterListener({}, {});
  await fixture.save({ oauth: true });
  const row = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "hosted" });
  assert.ok(row);
  await deps.externalMcpServerRepo.upsert({ ...row, oauthStatus: "needs_reauth" });
  const refused = await runtime.admissions();
  assert.equal(refused.ok, true);
  assert.match(JSON.stringify(refused), /authorization expired|reconnect/i);
  assert.ok(deps.externalMcpOAuth);
  const oauth = deps.externalMcpOAuth;
  let prompts = 0;
  const notice = await runtime.daemonCalls.executor.execute({ toolId: "external_mcp_reauth_prompt", input: { id: "hosted" }, principal: { id: "owner" }, run: { id: "run" } }, {
    emitSurface: async () => {
      prompts++;
      assert.equal(session.calls.length, 0);
      const redirectUri = "https://site.example/api/external-mcp/hosted/oauth/callback";
      const started = await oauth.beginConnect({ serverId: "hosted", redirectUri });
      assert.equal(started.kind, "redirect_required");
      if (started.kind !== "redirect_required") assert.fail("expected browser authorization");
      const state = new URL(started.authorizationUrl).searchParams.get("state")!;
      await oauth.completeAuthorizationCallback({ serverId: "hosted", redirectUri, params: { state, code: "fresh-code" } });
      const exchangeId = surface.surfaceExchanges.findTypedAnswerTarget({ principalId: "owner", toolId: "external_mcp_reauth_prompt" });
      assert.ok(exchangeId, "the browser must answer the server surface's own exchange store");
      assert.deepEqual(surface.surfaceExchanges.deliver({ exchangeId, principalId: "owner", params: {} }, { toolId: "external_mcp_reauth_prompt" }), { ok: true });
    },
  });
  assert.equal(notice.ok, true, JSON.stringify(notice));
  assert.match(JSON.stringify(notice), /acknowledged.*true/);
  assert.equal(prompts, 1);
  assert.equal(surface.surfaceExchanges.size(), 0);
  const result = await runtime.daemonCalls.executor.execute({ toolId: "mcp__hosted__echo", input: { message: "after reconnect" }, principal: { id: "owner" }, run: { id: "run" } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(session.calls, [{ name: "echo", arguments: { message: "after reconnect" } }]);
  assert.equal(tokenRequests, 1);
  assert.deepEqual(tokens, ["Bearer reconnected-token"]);
  const denied = await runtime.daemonCalls.executor.execute({ toolId: "mcp__hosted__echo", input: {}, principal: { id: "ungranted" }, run: { id: "run-denied" } });
  assert.equal(denied.ok, false);
  assert.equal(session.calls.length, 1, "server execution must retain the existing permission gate");
  assert.equal(isAssistantDaemonReady(), false);
  assert.equal(spawns, 0);
});

test("new admissions appear in daemon-call catalogs", async t => {
  t.mock.method(childProcess, "spawn", () => { throw new Error("catalog reads must not spawn a daemon"); });
  const connected: string[] = [];
  const { surface, save } = serverFederationFixture({ connect: async connection => {
    connected.push(connection.config.connectionId);
    return new InMemoryMcpSession({ tools: [{ name: "echo", description: "Plexquorn server catalog echo", inputSchema: { type: "object" } }] });
  } });
  await save();
  const runtime = createAssistantServerFederation({ toolSurface: surface }, {});
  const first = await runtime.daemonCalls.listToolsFor({ principalId: "owner" });
  assert.ok(first.some(tool => tool.id === "mcp__hosted__echo"), "cold catalog reads must await server admission");
  runtime.registerRosterListener({}, {});
  await save({ serverId: "second" });
  await Promise.all([notifyExternalMcpRosterChanged(), notifyExternalMcpRosterChanged()]);
  const next = await runtime.daemonCalls.listToolsFor({ principalId: "owner" });
  assert.equal(next.filter(tool => tool.id === "mcp__second__echo").length, 1);
  assert.deepEqual(connected.sort(), ["hosted", "second"]);
  const search = await surface.executeMetaTool({ id: "owner" }, { id: "run" }, { name: "search_tools", input: { query: "Plexquorn server catalog echo" } });
  assert.match(JSON.stringify(search), /mcp__second__echo/);
  assert.equal(isAssistantDaemonReady(), false);
});

test("server admissions keeps configuration and handshake failures visible and clears recovered failures", async () => {
  const failing = new Set(["bad-connect"]);
  const { deps, surface, save } = serverFederationFixture({ connect: async connection => {
    if (failing.has(connection.config.connectionId)) throw new Error("handshake timed out");
    return new InMemoryMcpSession({ tools: [{ name: "echo", inputSchema: { type: "object" } }] });
  } });
  await save();
  await save({ serverId: "bad-connect" });
  await save({ serverId: "needs-reauth", oauth: true });
  const row = await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "needs-reauth" });
  assert.ok(row);
  await deps.externalMcpServerRepo.upsert({ ...row, oauthStatus: "needs_reauth" });
  const runtime = createAssistantServerFederation({ toolSurface: surface }, {});
  const first = await runtime.admissions();
  assert.equal(first.ok, true);
  const snapshot = await surface.readFederationAdmissions({}, {});
  assert.deepEqual(snapshot.connections.map(entry => entry.connectionId), ["hosted"]);
  assert.deepEqual(snapshot.configFailures.map(entry => entry.connectionId).sort(), ["bad-connect", "needs-reauth"]);
  failing.clear();
  await save({ serverId: "needs-reauth" });
  await runtime.reload({}, {});
  const recovered = await surface.readFederationAdmissions({}, {});
  assert.deepEqual(recovered.configFailures, []);
  assert.equal(recovered.connections.length, 3);
});
