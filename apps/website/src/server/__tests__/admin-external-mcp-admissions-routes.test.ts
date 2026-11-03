import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { registerAdminExternalMcpAdmissionsRoute } from "../inbound/admin-http/routes/external-mcp/admissions.js";
import { bootAuthenticated } from "./helpers/http-test-server.js";
import { dispatchHttpRequest } from "./helpers/in-process-http.js";
import { isAssistantDaemonReady, resetAssistantDaemonSingletonForTests } from "../runtime/lifecycle/daemon-supervisor.js";
import { createAssistantServerFederation } from "../runtime/composition/modules/assistant-server-federation.js";
import { serverFederationFixture } from "../runtime/composition/modules/__tests__/helpers/server-federation-fixture.js";
import { InMemoryMcpSession } from "../../assistant/mcp-federation/adapter.memory.js";
import { createApp } from "../runtime/composition/app.js";
import { notifyExternalMcpRosterChanged, resetExternalMcpRosterChangeListenersForTests } from "../../assistant/external-mcp-roster-change.js";
import type { ExternalMcpOperations } from "../../features/external-mcp/operations-tools.js";

const PATH = "/api/admin/v1/workspaces/workspace-local/mcp-servers/admissions";

test("the serving app exposes admissions while export apps cannot replace its federation", async t => {
  resetExternalMcpRosterChangeListenersForTests();
  t.after(resetExternalMcpRosterChangeListenersForTests);
  const { deps, surface, save } = serverFederationFixture({ connect: async () => new InMemoryMcpSession({ tools: [{ name: "echo", inputSchema: { type: "object" } }] }) });
  deps.authorize = async () => ({ allowed: true, reason: "matched" });
  await save();
  const app = createApp(deps, { activateAssistantFederation: true, assistantToolSurface: surface });
  const reader = deps.externalMcpAdmissions;
  assert.equal(typeof reader, "function");
  const { cookie } = await bootAuthenticated(app, t);
  assert.equal((await request(app, cookie)).status, 200);
  createApp(deps);
  assert.equal(deps.externalMcpAdmissions, reader);
  await save({ serverId: "after-export" });
  await notifyExternalMcpRosterChanged();
  assert.ok((await surface.readFederationAdmissions({}, {})).connections.some(entry => entry.connectionId === "after-export"));
  assert.equal(isAssistantDaemonReady(), false);
});

function buildApp({ admissions, allowed = true }: { admissions?: ExternalMcpOperations["admissions"]; allowed?: boolean } = {}, _options: Record<string, never> = {}) {
  const deps = createRouteDeps();
  deps.externalMcpAdmissions = admissions;
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminExternalMcpAdmissionsRoute(app, { ...deps, authorize: allowed ? deps.authorize : async () => ({ allowed: false, reason: "no_grant" }) });
  return app;
}

async function request(app: express.Express, cookie = "", path = PATH) {
  const response = await dispatchHttpRequest({ app, method: "GET", url: path, headers: { cookie } });
  return { status: response.status, body: JSON.parse(response.body) as unknown };
}

test("admissions succeeds without starting a daemon", async t => {
  resetAssistantDaemonSingletonForTests();
  t.after(resetAssistantDaemonSingletonForTests);
  const { surface, save } = serverFederationFixture({ connect: async () => new InMemoryMcpSession({ tools: [{ name: "echo", inputSchema: { type: "object" } }] }) });
  await save();
  const server = createAssistantServerFederation({ toolSurface: surface }, {});
  const app = buildApp({ admissions: server.admissions });
  const { cookie } = await bootAuthenticated(app, t);
  let spawns = 0; let daemonRequests = 0;
  t.mock.method(childProcess, "spawn", () => { spawns++; throw new Error("admissions must not wake the daemon"); });
  t.mock.method(globalThis, "fetch", async () => { daemonRequests++; throw new Error("admissions are local"); });
  const response = await request(app, cookie);
  assert.equal(response.status, 200);
  assert.match(JSON.stringify(response.body), /mcp__hosted__echo/);
  assert.equal(surface.federation?.started, true);
  assert.equal(isAssistantDaemonReady(), false);
  assert.equal(spawns, 0);
  assert.equal(daemonRequests, 0);
});

test("the admissions route requires a session before reading federation", async t => {
  let reads = 0;
  const app = buildApp({ admissions: async () => { reads++; return { ok: true, connections: [] }; } });
  assert.equal((await request(app)).status, 401);
  assert.equal(reads, 0);
});

for (const mode of ["wrong workspace", "denied permission"] as const) {
  test(`admissions ${mode} does not start federation`, async t => {
    let reads = 0;
    const app = buildApp({ admissions: async () => { reads++; return { ok: true, connections: [] }; }, allowed: mode !== "denied permission" });
    const { cookie } = await bootAuthenticated(app, t);
    const path = mode === "wrong workspace" ? PATH.replace("workspace-local", "other-site") : PATH;
    assert.equal((await request(app, cookie, path)).status, mode === "wrong workspace" ? 404 : 403);
    assert.equal(reads, 0);
  });
}

test("the server report preserves preset identity and current resolution and connection failures", async t => {
  const connections = [{ connectionId: "preset", isPreset: true, report: { admitted: [], refused: [], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] } }];
  const configFailures = [{ connectionId: "bad-config", reason: "stored credentials unavailable" }, { connectionId: "bad-connect", reason: "handshake timed out" }];
  const app = buildApp({ admissions: async () => ({ ok: true, connections, configFailures }) });
  const { cookie } = await bootAuthenticated(app, t);
  assert.deepEqual(await request(app, cookie), { status: 200, body: { connections, configFailures } });
});

test("an unwired server federation is a distinguishable 503, never an empty roster", async t => {
  const app = buildApp();
  const { cookie } = await bootAuthenticated(app, t);
  const response = await request(app, cookie);
  assert.equal(response.status, 503);
  assert.equal((response.body as { code: string }).code, "AGENT_DAEMON_UNAVAILABLE");
  assert.equal("connections" in (response.body as object), false);
});
