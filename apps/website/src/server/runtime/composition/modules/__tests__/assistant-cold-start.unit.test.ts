import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Request, Response } from "express";
import * as daemonClient from "../assistant-daemon-client.js";
import * as assistantModule from "../assistant.js";
import { fetchDaemonAdmissions } from "../../../services/external-mcp-admissions.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../../../lifecycle/readiness-state.js";
import { resetAssistantDaemonSingletonForTests } from "../../../lifecycle/daemon-supervisor.js";

// Namespace imports keep the suite loadable on a build without these seams, so regressions in the
// pre-existing entry points (fetchAgentDaemon, triggerFederationReload, admissions) fail on behaviour.
const { fetchAgentDaemon, parkColdFrontendStream, triggerFederationReload } = daemonClient;
const { respondWithEnrichedAgentList } = assistantModule;

function response() {
  const events = new EventEmitter();
  const chunks: string[] = []; const headers = new Map<string, unknown>();
  let status = 200; let body: unknown; let ended = false;
  const res = Object.assign(events, {
    locals: { principal: { id: "owner" } },
    status(code: number) { status = code; return res; },
    json(value: unknown) { body = value; return res; },
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

test("a cold roster/settings change applies on next start and sends no daemon request", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("must stay cold"); });
  assert.deepEqual(await triggerFederationReload({}), { ok: true, appliesOnNextStart: true });
  assert.equal(calls, 0);
});

test("a parked page stream ends on ready; the reconnect reaches the real bind-token response", async (t) => {
  let ready = false; let tick!: () => void; let cancelled = 0;
  const first = response();
  assert.equal(parkColdFrontendStream({ res: first.res, isReady: () => ready }, {
    schedule: ({ work }) => { tick = work; return () => { cancelled++; }; },
  }), true);
  assert.equal(first.status(), 200);
  assert.equal(first.headers.get("Content-Type"), "text/event-stream");
  assert.match(first.chunks.join(""), /retry: 500/);
  tick(); assert.equal(first.ended(), false);
  ready = true; tick(); assert.equal(first.ended(), true); assert.ok(cancelled > 0);
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

test("admissions awaits the injected server gate and the daemon gate is inert", async () => {
  let release!: () => void; let sends = 0;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const fetch = (async () => { sends++; return new globalThis.Response('{"connections":[]}'); }) as typeof globalThis.fetch;
  const pending = fetchDaemonAdmissions({ token: "test", daemonUrl: "http://daemon", fetch, ensureReady: () => ready });
  assert.equal(sends, 0); release(); assert.deepEqual(await pending, { ok: true, connections: [] });
  assert.deepEqual(await fetchDaemonAdmissions({ token: "test", daemonUrl: "http://daemon", fetch, ensureReady: async () => {} }), { ok: true, connections: [] });
  assert.equal(sends, 2);
  const entry = readFileSync(new URL("../../../../inbound/assistant/agent-daemon-server.ts", import.meta.url), "utf8");
  assert.match(entry, /ensureDaemonReady: async \(\) => \{\}/);
});
