import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { MCP_UI_ACTION_PLAN_META_KEY } from "@jini-ai/protocol/mcp-ui";

import { AGENT_DAEMON_TOKEN_ENV_VAR, RUN_PRINCIPAL_HEADER } from "../../assistant/index.js";
import { createAdminAgUiApprovals } from "../../assistant/admin-ag-ui-approvals.js";
import { resetAssistantDaemonSingletonForTests, startAssistantDaemon } from "../runtime/lifecycle/daemon-supervisor.js";
import type { RouteDeps } from "../routes/types.js";
import { startTestServer, loginAsOwner, loginAsBarePrincipal } from "./helpers/http-test-server.js";

/**
 * @file P6-T2.T step 4: the admin AG-UI approval handoff end to end. A stand-in daemon plays the
 * real wire (run start, a held run's event stream with SSE ids and `Last-Event-ID` reconnect, the
 * guarded `mcp-ui/tool-calls` exchange answer and the owned cancel); everything on the Tovu side
 * is the production route, coordinator and daemon answer.
 */

const TOKEN = "e".repeat(64);
const EXCHANGE_PATH = "/api/admin/v1/mcp-ui/tool-calls";

let launches: string[] = [];
let cancels: string[] = [];
let answers: Array<{ principal: string | undefined; body: unknown }> = [];
let lastEventIds: Array<string | undefined> = [];
let eventsClosed = 0;
let mode: "approval" | "ordinary" = "approval";

function frame(runId: string, id: number, kind: string, payload: unknown): string {
  return `id: ${id}\nevent: ${kind}\ndata: ${JSON.stringify({ runId, eventId: `e${id}`, opaqueCursor: String(id), protocolVersion: 1, ts: 0, kind, payload, durability: "durable" })}\n\n`;
}

function card(runId: string, actions: string[]): unknown {
  return { type: "mcp-ui", surfaceExchange: { exchangeId: "ex-1", toolId: "posts.delete", runId },
    resource: { type: "resource", resource: { uri: "ui://tovu/posts-delete/ex-1", mimeType: "text/html", text: "<p>Delete?</p>",
      _meta: { [MCP_UI_ACTION_PLAN_META_KEY]: { title: "Delete the post?", actions: actions.map((id) => ({ id, label: id })) } } } } };
}

function writeEvents(req: IncomingMessage, res: import("node:http").ServerResponse, runId: string): void {
  const lastEventId = req.headers["last-event-id"] as string | undefined;
  lastEventIds.push(lastEventId);
  res.writeHead(200, { "content-type": "text/event-stream" });
  req.on("close", () => { eventsClosed++; });
  if (mode === "ordinary") {
    res.write(frame(runId, 1, "agent", card(runId, ["submit"])));
    res.write(frame(runId, 2, "agent", { type: "text_delta", delta: "Form shown." }));
    res.end(frame(runId, 3, "end", { reason: "stop", status: "succeeded" }));
    return;
  }
  if (lastEventId === "2") {
    res.write(frame(runId, 3, "agent", { type: "text_delta", delta: "After approval." }));
    res.end(frame(runId, 4, "end", { reason: "stop", status: "succeeded" }));
    return;
  }
  // The held run: the card is the last frame until the human answers, so the stream stays open.
  res.write(frame(runId, 1, "agent", { type: "text_delta", delta: "Before card." }));
  res.write(frame(runId, 2, "agent", card(runId, ["confirm", "cancel"])));
}

async function startStandInDaemon(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const url = req.url ?? "";
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : {};
      if (req.method === "POST" && url === "/api/runs") {
        launches.push(String(body.runId));
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ run: { id: body.runId } }));
        return;
      }
      if (req.method === "POST" && url === EXCHANGE_PATH) {
        answers.push({ principal: req.headers[RUN_PRINCIPAL_HEADER.toLowerCase()] as string | undefined, body });
        // Like the real exchange store: the first answer is delivered, a later one finds it closed.
        res.writeHead(answers.length === 1 ? 202 : 409, { "content-type": "application/json" }).end("{}");
        return;
      }
      const events = url.match(/^\/api\/runs\/([^/?]+)\/events/);
      if (events) { writeEvents(req, res, decodeURIComponent(events[1]!)); return; }
      const cancel = url.match(/^\/api\/runs\/([^/?]+)\/cancel/);
      if (cancel) cancels.push(decodeURIComponent(cancel[1]!));
      const status = url.match(/^\/api\/runs\/([^/?]+)$/);
      if (status) { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ run: { id: status[1], status: "canceled" } })); return; }
      res.writeHead(cancel ? 200 : 404, { "content-type": "application/json" }).end("{}");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

let daemonServer: Server | null = null;
async function boot(t: import("node:test").TestContext) {
  if (!daemonServer) {
    const { origin, server } = await startStandInDaemon();
    daemonServer = server;
    process.env.JINI_AGENT_DAEMON_URL = origin;
    process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;
  }
  resetAssistantDaemonSingletonForTests();
  startAssistantDaemon({ workspaceId: "test", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {},
    spawnDaemonProcess: () => Object.assign(new EventEmitter(), { pid: 321, kill: () => true }),
    readDiscovery: async () => ({ pid: 321, url: "http://127.0.0.1:0" }),
  });
  t.after(resetAssistantDaemonSingletonForTests);
  const { createRouteDeps } = await import("../runtime/composition/app.js");
  const { createAssistantAgUiModule, answerDaemonApprovalExchange } = await import("../runtime/composition/modules/assistant-ag-ui.js");
  const { createAssistantModule } = await import("../runtime/composition/modules/assistant.js");
  const { registerAuthRoutes } = await import("../inbound/admin-http/dev-auth.js");
  const { createSurfaceExchangeStore } = await import("@jini-ai/daemon/surface-exchanges");
  const deps: RouteDeps = createRouteDeps();
  const scheduler = createTimeoutScheduler({});
  const approvals = createAdminAgUiApprovals({ nowMs: Date.now, scheduler, newInterruptId: randomUUID, answerExchange: answerDaemonApprovalExchange });
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  createAssistantAgUiModule(deps, { approvals }).registerRoutes?.({ app });
  createAssistantModule({ routeDeps: Object.assign(deps, { assistantDaemonDemand: { ensureReady: async () => {}, isReady: () => true } }),
    byokSurfaceExchanges: createSurfaceExchangeStore({ scheduler, clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
  { approvals }).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  launches = []; cancels = []; answers = []; lastEventIds = []; eventsClosed = 0; mode = "approval";
  const cookie = await loginAsOwner(baseUrl);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as { user: { id: string } };
  const conversationId = `conv-${randomUUID()}`;
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: me.user.id }).create({ id: conversationId });
  return { baseUrl, cookie, deps, ownerId: me.user.id, conversationId };
}

test.after(async () => { daemonServer?.closeAllConnections(); await new Promise<void>((resolve) => daemonServer ? daemonServer.close(() => resolve()) : resolve()); });

type Ev = { type: string; [key: string]: unknown };
function parse(text: string): Ev[] {
  return text.split("\n\n").map((f) => f.trim()).filter(Boolean).map((f) => JSON.parse(f.replace(/^data:\s*/, "")) as Ev);
}

const RUN_PATH = "/api/admin/v1/assistant/ag-ui-run";
async function startTurn({ baseUrl, cookie, conversationId }: { baseUrl: string; cookie: string; conversationId: string }) {
  const res = await fetch(`${baseUrl}${RUN_PATH}`, { method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ threadId: "client-thread", runId: "seg-1", messages: [{ role: "user", content: "delete it" }],
      forwardedProps: { agentId: "claude", durableRun: { conversationId, assistantMessageId: `msg-${randomUUID()}` } } }) });
  assert.equal(res.status, 200);
  const events = parse(await res.text());
  const finished = events.at(-1) as { type: string; runId: string; outcome?: { type: string; interrupts: Array<{ id: string; reason: string; message?: string }> } };
  return { events, finished, runId: finished.runId };
}

function resumeBody({ conversationId, parentRunId, interruptId, payload = "allow", runId = "seg-2", extra = {} }:
  { conversationId: string; parentRunId: string; interruptId: string; payload?: string; runId?: string; extra?: object }): string {
  return JSON.stringify({ threadId: conversationId, runId, parentRunId, messages: [], state: {}, tools: [], context: [],
    resume: [{ interruptId, status: "resolved", payload }], forwardedProps: { agentId: "claude" }, ...extra });
}

async function resume({ baseUrl, cookie, body }: { baseUrl: string; cookie: string; body: string }) {
  const res = await fetch(`${baseUrl}${RUN_PATH}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body });
  return { status: res.status, text: await res.text() };
}

const REFUSAL = JSON.stringify({ error: "This request expired. Ask again." });

test("admin resume answers the parked card exactly once through the daemon's guarded answer", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId, ownerId } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  assert.equal(first.finished.outcome?.type, "interrupt");
  const interrupt = first.finished.outcome!.interrupts[0]!;
  assert.equal(interrupt.reason, "confirmation");
  assert.equal(interrupt.message, "Delete the post?");
  assert.notEqual(interrupt.id, "ex-1", "the exchange id stays on the server");
  assert.ok(!first.events.some((e) => e.type === "CUSTOM" && e.name === "tovu.ext.mcp-ui"), "the interrupt replaces the card");
  const second = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: first.runId, interruptId: interrupt.id }) });
  assert.equal(second.status, 200, second.text);
  const events = parse(second.text);
  assert.deepEqual(events[0], { type: "RUN_STARTED", threadId: conversationId, runId: "seg-2", parentRunId: first.runId });
  const text = events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta).join("");
  assert.equal(text, "After approval.", "neither the card nor earlier deltas repeat");
  assert.equal(events.at(-1)?.type, "RUN_FINISHED");
  assert.deepEqual(answers, [{ principal: ownerId, body: { toolName: "posts.delete", params: { __exchangeId: "ex-1", decision: "confirm" } } }]);
  assert.deepEqual(launches, [first.runId], "the same daemon run continues; nothing new starts");
  assert.deepEqual(lastEventIds, [undefined, "2"]);
});

test("admin decline runs nothing", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  const interruptId = first.finished.outcome!.interrupts[0]!.id;
  const declined = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: first.runId, interruptId, payload: "deny" }) });
  assert.equal(declined.status, 200, declined.text);
  assert.deepEqual(answers.map((a) => (a.body as { params: { decision: string } }).params.decision), ["cancel"]);
  assert.deepEqual(launches, [first.runId]);
});

test("admin resume by another owner or for another run is refused in plain words without consuming the claim", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId, deps } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  const interruptId = first.finished.outcome!.interrupts[0]!.id;
  const intruder = await loginAsBarePrincipal(deps as unknown as Parameters<typeof loginAsBarePrincipal>[0], baseUrl);
  const asIntruder = await resume({ baseUrl, cookie: intruder,
    body: resumeBody({ conversationId, parentRunId: first.runId, interruptId, extra: { forwardedProps: { agentId: "claude", owner: "owner" } } }) });
  assert.equal(asIntruder.status, 400);
  assert.equal(asIntruder.text, REFUSAL);
  for (const body of [
    resumeBody({ conversationId, parentRunId: "another-run", interruptId }),
    resumeBody({ conversationId: "another-thread", parentRunId: first.runId, interruptId }),
    resumeBody({ conversationId, parentRunId: first.runId, interruptId: "another-interrupt" }),
    resumeBody({ conversationId, parentRunId: first.runId, interruptId, payload: "yes please" }),
  ]) {
    const refused = await resume({ baseUrl, cookie, body });
    assert.deepEqual([refused.status, refused.text], [400, REFUSAL]);
  }
  assert.equal(answers.length, 0, "nothing reached the daemon");
  const owner = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: first.runId, interruptId }) });
  assert.equal(owner.status, 200, "the owner's claim survived every refused probe");
  assert.equal(answers.length, 1);
});

test("replayed admin resume does nothing", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  const body = resumeBody({ conversationId, parentRunId: first.runId, interruptId: first.finished.outcome!.interrupts[0]!.id });
  const both = await Promise.all([resume({ baseUrl, cookie, body }), resume({ baseUrl, cookie, body })]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 400]);
  assert.equal(both.find((r) => r.status === 400)?.text, REFUSAL);
  assert.equal(answers.length, 1, "one answer reached the daemon");
  const later = await resume({ baseUrl, cookie, body });
  assert.deepEqual([later.status, answers.length], [400, 1]);
});

test("closing the admin interrupt response leaves the daemon run alive", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  assert.equal(first.finished.outcome?.type, "interrupt");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(eventsClosed, 1, "the interrupt segment detached from the daemon stream");
  assert.deepEqual(cancels, [], "the deliberate park close is not a Stop");
  const resumed = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: first.runId, interruptId: first.finished.outcome!.interrupts[0]!.id }) });
  assert.equal(resumed.status, 200, "the held invocation is still there to answer");
});

test("ordinary admin cards still stream without an interrupt", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId } = await boot(t);
  mode = "ordinary";
  const turn = await startTurn({ baseUrl, cookie, conversationId });
  assert.equal(turn.finished.outcome, undefined);
  assert.equal(turn.events.filter((e) => e.type === "CUSTOM" && e.name === "tovu.ext.mcp-ui").length, 1);
  assert.ok(turn.events.some((e) => e.type === "TEXT_MESSAGE_CONTENT" && e.delta === "Form shown."));
});

test("Stop on a parked admin approval settles it once", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  const body = resumeBody({ conversationId, parentRunId: first.runId, interruptId: first.finished.outcome!.interrupts[0]!.id });
  const [stop, raced] = await Promise.all([
    fetch(`${baseUrl}/api/runs/${encodeURIComponent(first.runId)}/cancel`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: "{}" }),
    resume({ baseUrl, cookie, body }),
  ]);
  assert.equal(stop.status, 200);
  // Exactly one of the two owns the parked approval: either the answer reached the daemon, or the
  // Stop settled it and the resume was refused — never both, never neither.
  assert.equal(answers.length + (raced.status === 400 ? 1 : 0), 1, `resume ${raced.status}, answers ${answers.length}`);
  const after = await resume({ baseUrl, cookie, body });
  assert.deepEqual([after.status, after.text], [400, REFUSAL]);
  assert.ok(answers.length <= 1);
});
