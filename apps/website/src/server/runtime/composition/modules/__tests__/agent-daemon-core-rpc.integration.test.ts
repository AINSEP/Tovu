import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../../app.js";
import { registerAgentDaemonCoreRoutes } from "../agent-daemon-core-rpc.js";
import { createAgentDaemonCoreDeps } from "../../agent-daemon-core-deps.js";
import { ensureToolExecToken, RUN_PRINCIPAL_HEADER } from "#src/assistant/daemon-access";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerDurableRunStartRoute } from "#src/server/inbound/assistant/durable-run-routes";
import { createEarlySessionCapture } from "#src/server/inbound/assistant/early-run-session";
import { captureDaemonRun } from "#src/server/inbound/assistant/__tests__/helpers/daemon-source";
import { createLiveRunTracker, waitForStoppingRuns, STOPPING_RUN_WAIT_MS, CONCURRENT_RUN_REFUSAL_MESSAGE } from "#src/assistant/agent-session-preset";
import { createInMemoryEventLog, createRunLifecycle } from "@jini-ai/daemon";

async function fixture(t: import("node:test").TestContext, overrides: Partial<Pick<ReturnType<typeof createRouteDeps>, "tracker" | "aiTraceSink">> = {}) {
  const server = { ...createRouteDeps(), ...overrides };
  await Promise.all(Object.entries(server).filter(([key]) => key.endsWith("Ready")).map(([, value]) => value));
  const token = ensureToolExecToken({}, {});
  const app = express();
  registerAgentDaemonCoreRoutes({ router: app, deps: server });
  const baseUrl = await startTestServer(app, t);
  const core = await createAgentDaemonCoreDeps({ env: { TOVU_DB: "memory", TOVU_SITE_LISTENER_ORIGIN: baseUrl }, token });
  t.after(() => core.close().catch(() => {}));
  const principalId = await server.ownerPrincipalId;
  const context = { principalId, conversationId: "chat", prompt: "Use my accepted answer", assistantMessageId: "answer" };
  await server.chatHistory({ kind: "user", workspaceId: server.workspaceId, userId: principalId }).create({ id: "chat" });
  await server.chatRunLedger.durable!.accept({ conversationId: "chat", messageId: "answer", runId: "daemon-test-run", principalId,
    workspaceId: server.workspaceId, now: Date.now(), request: { agentId: "codex", contextRef: JSON.stringify(context) } }, {});
  return { server, core, principalId, context, token, baseUrl };
}

test("an accepted memory-mode answer reaches CLI launch through the site's attempt authority", async t => {
  const f = await fixture(t);
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const daemon = express(); daemon.use(express.json());
  daemon.use((req, _res, next) => { req.headers[RUN_PRINCIPAL_HEADER] = f.principalId; next(); });
  let launches = 0;
  registerDurableRunStartRoute({ app: daemon, lifecycle, store: f.core.chatRunLedger.durable, onStarted: async ({ request }) => {
    const launch = await captureDaemonRun(f.context, { request: { ...request }, bindings: { routeDeps: f.core, liveRunTracker: createLiveRunTracker({}, {}), waitForStoppingRuns, STOPPING_RUN_WAIT_MS, CONCURRENT_RUN_REFUSAL_MESSAGE } });
    assert.equal(launch.runId, "daemon-test-run"); launches++;
  } });
  const origin = await startTestServer(daemon, t);
  const response = await fetch(`${origin}/api/runs`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId: "daemon-test-run", contextRef: JSON.stringify(f.context) }) });
  assert.equal(response.status, 201, await response.text()); assert.equal(launches, 1);
  const capture = createEarlySessionCapture({ sessions: f.core.agentSessions, durable: f.core.chatRunLedger.durable, readStart: async () => "child-start" });
  await capture({ runId: "daemon-test-run", conversationId: "chat", agentId: "codex", event: { kind: "agent", payload: { type: "status", sessionId: "cli-session", childPid: 123 } } });
  const saved = await f.server.chatRunLedger.durable!.find({ runId: "daemon-test-run" }, {});
  assert.equal(await f.core.getSessionForAttempt({ runId: "daemon-test-run" }), "cli-session");
  assert.equal(saved?.sessionId, "cli-session"); assert.equal(saved?.child?.startedAt, "child-start");
  // Re-evaluate the actual launch assembly after early capture. This fixture captures executor
  // input; it never launches a second CLI. The daemon-local memory map intentionally has no locator.
  assert.equal(await f.core.agentSessions.getSessionId({ conversationId: "chat", agentId: "codex" }), null);
  const resumed = await captureDaemonRun(f.context, { request: { agentId: "codex" }, bindings: {
    routeDeps: f.core, liveRunTracker: createLiveRunTracker({}, {}), waitForStoppingRuns, STOPPING_RUN_WAIT_MS, CONCURRENT_RUN_REFUSAL_MESSAGE,
  } });
  assert.equal(resumed.resumeSessionId, "cli-session");
  await f.server.chatRunLedger.durable!.cancel({ runId: "daemon-test-run", reason: "stop" }, {});
  const stopped = await fetch(`${origin}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: "daemon-test-run" }) });
  assert.equal(stopped.status, 409); assert.equal(launches, 1);
  assert.equal(await f.core.chatRunLedger.durable.captureSession({ runId: "daemon-test-run", sessionId: "late-session" }, {}), false);
});

test("memory-mode mutations retain the server's unknown-write fence across daemon clients", async t => {
  const f = await fixture(t);
  const durable = f.core.chatRunLedger.durable;
  const call = { runId: "daemon-test-run", toolId: "write", input: { title: "once" }, toolUseId: "first" };
  assert.equal(await durable.guardTool(call, {}), "allowed");
  const replacement = await createAgentDaemonCoreDeps({ env: { TOVU_DB: "memory", TOVU_SITE_LISTENER_ORIGIN: f.baseUrl }, token: f.token });
  t.after(() => replacement.close().catch(() => {}));
  assert.equal(await replacement.chatRunLedger.durable.guardTool({ ...call, toolUseId: "blind-repeat" }, {}), "unknown");
  await durable.completeTool({ runId: call.runId, toolUseId: "first", content: "saved" }, {});
  assert.equal(await durable.guardTool({ ...call, toolUseId: "verified-next" }, {}), "allowed");
  assert.equal(await durable.find({ runId: call.runId, principalId: "another-person" }, {}), null);
});

test("core RPC authenticates before parsing and refuses caller-selected workspace and acceptance", async t => {
  const f = await fixture(t);
  const url = `${f.baseUrl}/internal/agent-daemon-core`;
  assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status, 401);
  for (const body of [{ operation: "accept", input: {} }, { operation: "find", input: { runId: "daemon-test-run", workspaceId: "foreign" } }]) {
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${f.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});

test("daemon diagnostics and every AI trace event use the site's configured provider ports without disposing them", async t => {
  const { createNoopTracker } = await import("@jini-ai/diagnostics/observability");
  const errors: { message: string; process: unknown }[] = [];
  const captures: unknown[] = [];
  const events: import("@jini-ai/agent-runtime/ai-trace").AiTraceEvent[] = [];
  let flushed = 0; let disposed = 0;
  const f = await fixture(t, { tracker: { ...createNoopTracker({}),
    capture: (event, options) => { captures.push({ ...event, ...options }); },
    error: ({ error }, options) => { errors.push({ message: error.message, process: options?.context?.attributes?.process }); },
  }, aiTraceSink: { capture: "full", record: event => { events.push(event); }, flush: async () => { flushed++; }, shutdown: async () => { disposed++; } } });
  const traceId = "trace";
  const traceEvents: typeof events = [
    { kind: "run_started", traceId, runId: "daemon-test-run", at: 1, agentId: "codex", provider: null, model: null, sessionId: null, input: null, tags: [] },
    { kind: "model_turn", traceId, turnId: "turn", index: 0, startedAt: 1, endedAt: 2, model: null, input: null, output: null, reasoning: null, usage: null, costUsd: null, costSource: null, ttftMs: null, stopReason: null, error: null },
    { kind: "tool_call", traceId, turnId: "turn", toolCallId: "call", name: "page.inspect", input: null, output: null, isError: false, errorClass: null, startedAt: 1, endedAt: 2 },
    { kind: "run_finished", traceId, at: 3, outcome: "succeeded", error: null, totals: { turns: 1, toolCalls: 1, toolErrors: 0, inputTokens: null, outputTokens: null, costUsd: null } },
  ];
  assert.equal(f.core.aiTraceSink?.capture, "full");
  for (const event of traceEvents) f.core.aiTraceSink?.record(event);
  f.core.tracker.error({ error: new Error("failed with private-value") }, { context: { operation: "probe", exactSecrets: ["private-value"] } });
  f.core.tracker.capture({ name: "assistant_run_started", userId: f.principalId }, { properties: { chatSurface: "daemon" } });
  await f.core.close();
  assert.deepEqual(events.map(event => event.kind), traceEvents.map(event => event.kind));
  assert.equal(errors.length, 1); assert.equal(errors[0]?.process, "daemon"); assert.doesNotMatch(errors[0]!.message, /private-value/);
  assert.deepEqual(captures, [{ name: "assistant_run_started", userId: f.principalId, properties: { chatSurface: "daemon" } }]);
  assert.equal(flushed, 1); assert.equal(disposed, 0, "daemon close must never shut down the site's provider leases");
});

test("attempt lookup carries live authority without copying the answer event log", async t => {
  const f = await fixture(t);
  const head = await f.core.chatRunLedger.durable.find({ runId: "daemon-test-run" }, {});
  assert.equal(head?.runId, "daemon-test-run");
  assert.equal(head?.principalId, f.principalId);
  assert.equal(head?.request.contextRef, JSON.stringify(f.context));
  assert.equal("events" in head!.message, false);
  assert.equal("attemptBase" in head!, false);
});

test("the next daemon run reads live provider capture policy from its site authority", async t => {
  let capture: import("@jini-ai/agent-runtime/ai-trace").AiContentCapture = "metadata";
  const f = await fixture(t, { aiTraceSink: { get capture() { return capture; }, record() {} } });
  assert.equal(f.core.aiTraceSink?.capture, "metadata");
  capture = "full";
  await f.core.chatRunLedger.durable.find({ runId: "daemon-test-run" }, {});
  assert.equal(f.core.aiTraceSink?.capture, "full");
  capture = "off";
  await f.core.chatRunLedger.durable.find({ runId: "daemon-test-run" }, {});
  assert.equal(f.core.aiTraceSink?.capture, "off");
});
