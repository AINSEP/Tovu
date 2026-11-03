import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createDesktopMcpRuntime } from "../desktop-mcp-runtime.js";
import { createByokToolSurface } from "../byok-tool-surface.js";
import { createDefaultConnect, tovuStdioLaunchResolverFromEnv } from "../mcp-federation/bootstrap.js";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerDesktopMcpHandoff } from "#src/server/runtime/composition/modules/desktop-mcp-handoff";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { startMcpHttpToolServer } from "@jini-ai/mcp";
import { saveExternalMcpServer } from "#src/features/external-mcp/external-mcp-store";
import { createAssistantServerFederation } from "#src/server/runtime/composition/modules/assistant-server-federation";

async function fixture(t: test.TestContext, { deferEndpoint = false } = {}) {
  const host = await startMcpHttpToolServer({ name: "desktop", version: "1", resolveBaseUrl: () => "", tools: [
    { name: "list_sites", description: "List websites", inputSchema: { type: "object" }, annotations: { readOnlyHint: true }, handler: async () => ({ count: 2 }) },
  ] });
  t.after(() => host.close({}));
  const env = { ...(!deferEndpoint ? { TOVU_DESKTOP_MCP_URL: host.url, TOVU_DESKTOP_MCP_TOKEN: host.token } : {}), TOVU_DESKTOP_MCP_HANDOFF_TOKEN: "b".repeat(64) };
  const runtime = createDesktopMcpRuntime({ env }, {});
  const deps = createRouteDeps();
  deps.authorize = async () => ({ allowed: true, reason: "matched" });
  const connectHttp = createDefaultConnect({ resolver: tovuStdioLaunchResolverFromEnv({}) }, { bearerToken: runtime.bearerToken });
  const stdioAttempts: string[] = [];
  const surface = createByokToolSurface(deps, { desktopMcpRuntime: runtime, federationConnect: async connection => {
    if ("command" in connection.launch) { stdioAttempts.push(connection.config.connectionId); throw new Error("stored stdio fixture"); }
    return connectHttp(connection);
  } });
  return { host, runtime, deps, surface, env, stdioAttempts };
}

test("desktop tools work without keyring or stored row", async t => {
  const { deps, surface, stdioAttempts } = await fixture(t);
  const snapshot = await surface.readFederationAdmissions({}, {});
  assert.equal(snapshot.connections.find(entry => entry.connectionId === "tovu-desktop")?.isPreset, true);
  assert.deepEqual(await deps.externalMcpServerRepo.listByWorkspaceId(deps.workspaceId), []);
  assert.deepEqual(stdioAttempts, []);
  const result = await surface.daemonCalls.executor.execute({ principal: { id: "owner" }, run: { id: "desktop-read" }, toolId: "mcp__tovu-desktop__list_sites", input: {} });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(JSON.stringify(result), /count/);
});

test("legacy managed connection is not admitted twice", async t => {
  const { deps, surface, stdioAttempts } = await fixture(t);
  for (const serverId of ["tovu-desktop", "unrelated"]) {
    await saveExternalMcpServer({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, {
      workspaceId: deps.workspaceId, principalId: "owner", serverId, enabled: true, transport: "stdio", command: "must-never-launch", args: "", env: "", authMode: "none", allowedToolNames: "list_sites", writeAllowedToolNames: "",
    });
  }
  const snapshot = await surface.readFederationAdmissions({}, {});
  assert.equal(snapshot.connections.filter(entry => entry.connectionId === "tovu-desktop").length, 1);
  assert.equal(await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "tovu-desktop" }), null);
  assert.ok(await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "unrelated" }));
  assert.deepEqual(stdioAttempts, ["unrelated"]);
});

test("runtime bearer is scoped to the exact owner endpoint and removed from child environment", async t => {
  const { runtime, host, env } = await fixture(t);
  assert.deepEqual(env, {});
  assert.equal(await runtime.bearerToken({ url: host.url }), host.token);
  for (const url of [host.url + "/other", host.url + "?redirect=1", host.url.replace("127.0.0.1", "localhost"), "https://other.example/mcp"]) {
    assert.equal(await runtime.bearerToken({ url }), undefined);
  }
});

test("a web server never launches the retired desktop bridge without a spawning main", async t => {
  const { deps } = await fixture(t);
  await saveExternalMcpServer({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock }, {
    workspaceId: deps.workspaceId, principalId: "owner", serverId: "tovu-desktop", enabled: true, transport: "stdio",
    command: "old-desktop-launcher", args: "", env: "", authMode: "none", allowedToolNames: "list_sites", writeAllowedToolNames: "",
  });
  const runtime = createDesktopMcpRuntime({ env: {} }, {});
  let attempts = 0;
  const surface = createByokToolSurface(deps, { desktopMcpRuntime: runtime, federationConnect: async () => {
    attempts++; throw new Error("a web process cannot launch desktop tools");
  } });
  assert.deepEqual((await surface.readFederationAdmissions({}, {})).connections, []);
  assert.equal(attempts, 0);
  assert.ok(await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "tovu-desktop" }), "only an owned desktop launch cleans the stored identity");
});

test("only the spawning main can complete an initial handoff and its endpoint cannot be replaced", async t => {
  const runtime = createDesktopMcpRuntime({ env: { TOVU_DESKTOP_MCP_HANDOFF_TOKEN: "a".repeat(64) } }, {});
  let reloads = 0;
  const app = express();
  registerDesktopMcpHandoff({ router: app, runtime, reload: async () => { reloads++; } }, {});
  const base = await startTestServer(app, t);
  const capability = { url: "http://127.0.0.1:49111/mcp", token: "c".repeat(64) };
  const send = (token: string, body = JSON.stringify(capability), origin?: string) => fetch(`${base}/internal/desktop-mcp-capability`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(origin !== undefined ? { origin } : {}) }, body,
  });
  assert.equal((await send("wrong", "{invalid")).status, 401);
  assert.equal((await send("a".repeat(64), "{invalid", "null")).status, 403);
  assert.equal(reloads, 0);
  for (const url of ["https://remote.example/mcp", "http://localhost:49111/mcp", "http://127.0.0.1:65536/mcp", "http://127.0.0.1:49111/mcp?token=x"]) {
    assert.equal((await send("a".repeat(64), JSON.stringify({ ...capability, url }))).status, 400);
  }
  assert.equal(reloads, 0);
  assert.equal((await send("a".repeat(64))).status, 204);
  assert.equal(runtime.connection({}, {})?.launch && "url" in runtime.connection({}, {})!.launch, true);
  assert.equal(reloads, 1);
  assert.equal((await send("d".repeat(64))).status, 401);
  assert.equal((await send("a".repeat(64), JSON.stringify({ ...capability, url: "http://127.0.0.1:49112/mcp" }))).status, 409);
});

test("listener recovery after a cold server start admits the desktop preset without manual action", async t => {
  const { host, runtime, surface } = await fixture(t, { deferEndpoint: true });
  const server = createAssistantServerFederation({ toolSurface: surface }, {});
  assert.equal((await surface.readFederationAdmissions({}, {})).connections.length, 0);
  const app = express();
  registerDesktopMcpHandoff({ router: app, runtime, reload: async () => {
    await server.reload({}, {});
    return (await surface.readFederationAdmissions({}, {})).connections.some(entry => entry.connectionId === "tovu-desktop");
  } }, {});
  const base = await startTestServer(app, t);
  const response = await fetch(`${base}/internal/desktop-mcp-capability`, { method: "POST",
    headers: { authorization: `Bearer ${"b".repeat(64)}`, "content-type": "application/json" },
    body: JSON.stringify({ url: host.url, token: host.token }),
  });
  assert.equal(response.status, 204);
  const report = await surface.readFederationAdmissions({}, {});
  assert.equal(report.connections.find(entry => entry.connectionId === "tovu-desktop")?.isPreset, true);
  const tools = await server.daemonCalls.listToolsFor({ principalId: "owner" });
  assert.ok(tools.some(tool => tool.id === "mcp__tovu-desktop__list_sites"));
  const result = await server.daemonCalls.executor.execute({ principal: { id: "owner" }, run: { id: "recovered" }, toolId: "mcp__tovu-desktop__list_sites", input: {} });
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("owner restart recovers without manual action", async t => {
  const first = await fixture(t);
  await first.surface.readFederationAdmissions({}, {});
  await first.host.close({});
  const restarted = await fixture(t);
  assert.notEqual(restarted.host.token, first.host.token);
  const connect = createDefaultConnect({ resolver: tovuStdioLaunchResolverFromEnv({}) }, { bearerToken: restarted.runtime.bearerToken });
  // A restarted owner spawns a new server over the same persistent workspace. No stored row or
  // keyring update can be required to replace the old process-local endpoint.
  const surface = createByokToolSurface(first.deps, { desktopMcpRuntime: restarted.runtime, federationConnect: connect });
  const server = createAssistantServerFederation({ toolSurface: surface }, {});
  assert.ok((await server.daemonCalls.listToolsFor({ principalId: "owner" })).some(tool => tool.id === "mcp__tovu-desktop__list_sites"));
  assert.equal(await restarted.runtime.bearerToken({ url: restarted.host.url }), restarted.host.token);
  assert.deepEqual(await first.deps.externalMcpServerRepo.listByWorkspaceId(first.deps.workspaceId), []);
  const result = await server.daemonCalls.executor.execute({ principal: { id: "owner" }, run: { id: "new-owner" }, toolId: "mcp__tovu-desktop__list_sites", input: {} });
  assert.equal(result.ok, true, JSON.stringify(result));
});
