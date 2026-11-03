import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Request, Response } from "express";
import * as daemonClient from "../assistant-daemon-client.js";
import * as assistantModule from "../assistant.js";
import { readServerAdmissions } from "../../../services/external-mcp-admissions.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../../../lifecycle/readiness-state.js";
import { resetAssistantDaemonSingletonForTests } from "../../../lifecycle/daemon-supervisor.js";

// Namespace imports keep the suite loadable on a build without these seams, so regressions in the
// pre-existing entry points (fetchAgentDaemon and admissions) fail on behaviour.
const { fetchAgentDaemon, parkColdFrontendStream } = daemonClient;
const { respondWithEnrichedAgentList } = assistantModule;

function response() {
  const events = new EventEmitter();
  const chunks: string[] = []; const headers = new Map<string, unknown>();
  let status = 200; let body: unknown; let ended = false;
  const res = Object.assign(events, {
    locals: { principal: { id: "owner" } },
    status(code: number) { status = code; return res; },
    json(value: unknown) { body = value; return res; },
    sendStatus(code: number) { status = code; ended = true; return res; },
    setHeader(key: string, value: unknown) { headers.set(key, value); return res; },
    flushHeaders() {}, write(value: string) { chunks.push(value); return true; },
    end() { ended = true; events.emit("close"); },
  }) as unknown as Response;
  return { res, chunks, headers, status: () => status, body: () => body, ended: () => ended };
}
const req = (method = "GET", originalUrl = "/api/agents") => ({ method, originalUrl, get: () => undefined }) as unknown as Request;

test.afterEach(() => { clearAssistantDaemonFailure(); resetAssistantDaemonSingletonForTests(); });

test("availability and rescan read the API inventory, preserving models, capabilities and discoveryPending without a daemon", async () => {
  let reads = 0; let rescans = 0;
  const agents = [{ id: "codex", models: [{ id: "model-a", label: "Model A" }], supportsImages: true, discoveryPending: true }];
  const routeDeps = { workspaceId: "site-a", assistantAgentInventory: {
    listAssistantAgents: async () => { reads++; return agents; },
    rescanAssistantAgents: async () => { rescans++; return agents; },
  } } as unknown as Parameters<typeof respondWithEnrichedAgentList>[0]["routeDeps"];
  for (const method of ["GET", "GET", "POST"]) {
    const result = response();
    await respondWithEnrichedAgentList({ req: req(method), res: result.res, routeDeps, liveModels: {} as never }, {});
    assert.deepEqual(result.body(), { agents });
  }
  assert.equal(reads, 2); assert.equal(rescans, 1);
});

test("known-failed latch still fails /api/agents without waking or reading the inventory", async () => {
  recordAssistantDaemonFailure("crash cap");
  const result = response();
  await respondWithEnrichedAgentList({ req: req(), res: result.res, routeDeps: {} as never, liveModels: {} as never }, {});
  assert.equal(result.status(), 503);
  assert.equal((result.body() as { code: string }).code, "AGENT_DAEMON_KNOWN_FAILED");
});

test("a parked page stream refuses without a session; an explicit wake reaches the real bind-token response", async (t) => {
  let ready = false;
  const first = response();
  assert.equal(parkColdFrontendStream({ res: first.res, isReady: () => ready }, {}), true);
  assert.equal(first.status(), 503);
  assert.deepEqual(first.body(), { error: "the agent daemon is parked", code: "AGENT_DAEMON_PARKED" });
  assert.deepEqual(first.chunks, []);
  assert.equal(first.headers.has("Content-Type"), false);
  ready = true;
  const reconnect = response();
  assert.equal(parkColdFrontendStream({ res: reconnect.res, isReady: () => ready }, {}), false);
  t.mock.method(globalThis, "fetch", async () => new globalThis.Response('data: {"type":"attached","bindToken":"real-token"}\n\n'));
  const urlBefore = process.env.JINI_AGENT_DAEMON_URL;
  process.env.JINI_AGENT_DAEMON_URL = "http://127.0.0.1:12345";
  t.after(() => { if (urlBefore === undefined) delete process.env.JINI_AGENT_DAEMON_URL; else process.env.JINI_AGENT_DAEMON_URL = urlBefore; });
  const upstream = await fetchAgentDaemon(req("GET", "/api/frontend-sessions/stream"), reconnect.res, { ensureReady: async () => {} });
  assert.match(await upstream!.text(), /real-token/);
});

test("first proxy request waits before forwarding and succeeds once ready", async (t) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  let sends = 0;
  t.mock.method(globalThis, "fetch", async () => { sends++; return new globalThis.Response("accepted"); });
  const urlBefore = process.env.JINI_AGENT_DAEMON_URL;
  process.env.JINI_AGENT_DAEMON_URL = "http://127.0.0.1:12345";
  t.after(() => { if (urlBefore === undefined) delete process.env.JINI_AGENT_DAEMON_URL; else process.env.JINI_AGENT_DAEMON_URL = urlBefore; });
  const pending = fetchAgentDaemon(req("POST", "/api/runs"), response().res, { ensureReady: () => ready, body: {} });
  assert.equal(sends, 0); release();
  assert.equal(await (await pending)!.text(), "accepted"); assert.equal(sends, 1);
});

test("activation racing park waits for an accepting daemon before allowing frontend rebind", async t => {
  let sends = 0; let wakes = 0;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(new URL(String(input)).pathname, "/api/active");
    assert.equal(init?.method, "GET");
    return ++sends === 1
      ? new Response(null, { status: 503, headers: { "x-tovu-daemon-parked": "1", "x-tovu-daemon-pid": "800" } })
      : Response.json({ active: false });
  });
  const result = response();
  await assistantModule.activateFrontendDaemon({ req: req("POST", "/api/frontend-sessions/activate"), res: result.res }, {
    ensureReady: async () => { wakes++; }, onParked: () => {},
  });
  assert.equal(result.status(), 204); assert.equal(wakes, 2); assert.equal(sends, 2);
});

test("admissions reads the server while the daemon stays stopped", async t => {
  let sends = 0;
  t.mock.method(globalThis, "fetch", async () => { sends++; throw new Error("must stay cold"); });
  assert.deepEqual(await readServerAdmissions({ awaitFederation: async () => ({ settled: true }), readAdmissions: async () => ({ connections: [] }) }), { ok: true, connections: [] });
  assert.equal(sends, 0);
});
