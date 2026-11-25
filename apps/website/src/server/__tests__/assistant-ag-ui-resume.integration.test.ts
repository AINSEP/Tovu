import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
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
import { startStubProviderServer } from "./helpers/stub-provider-server.js";
import { set as setLegacySetting } from "@jini-ai/core/settings";
import { writeVisitorTools } from "@jini-ai/cms/settings/site/visitor-tools-write";
import { setPublicAssistantSettings, setSiteAssistantCredential } from "../../assistant/index.js";
import { VISITOR_TOOLS_HOST, SETTINGS_WRITE_POLICIES } from "#src/features/settings/settings-write-policies";
import { VISITOR_APPROVAL_EXPIRED } from "#src/assistant/site/visitor-ag-ui-resume";

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
/** AG-UI segment subscriptions to the daemon event stream still held open (decremented on the
 *  response's own close). */
let openEventStreams = 0;
/** Held (never-ending) streams, ended as a stopped run after each test so no subscriber outlives it. */
const heldStreams = new Set<{ runId: string; res: import("node:http").ServerResponse }>();
let mode: "approval" | "ordinary" | "mixed" = "approval";

function frame(runId: string, id: number, kind: string, payload: unknown): string {
  return `id: ${id}\nevent: ${kind}\ndata: ${JSON.stringify({ runId, eventId: `e${id}`, opaqueCursor: String(id), protocolVersion: 1, ts: 0, kind, payload, durability: "durable" })}\n\n`;
}

function card(runId: string, actions: string[], { exchangeId = "ex-1", toolId = "posts.delete", title = "Delete the post?" } = {}): unknown {
  return { type: "mcp-ui", surfaceExchange: { exchangeId, toolId, runId },
    resource: { type: "resource", resource: { uri: `ui://tovu/${toolId}/${exchangeId}`, mimeType: "text/html", text: "<p>Delete?</p>",
      _meta: { [MCP_UI_ACTION_PLAN_META_KEY]: { title, actions: actions.map((id) => ({ id, label: id })) } } } } };
}

/** The golden turn's held run: deltas, an ordinary form card (no interrupt), then the approval card.
 *  A reconnect after the approval card's cursor continues past it. */
function writeMixedEvents(lastEventId: string | undefined, res: import("node:http").ServerResponse, runId: string): boolean {
  if (lastEventId === "3") {
    res.write(frame(runId, 4, "agent", { type: "text_delta", delta: "Deleted." }));
    res.end(frame(runId, 5, "end", { reason: "stop", status: "succeeded" }));
    return false;
  }
  res.write(frame(runId, 1, "agent", { type: "text_delta", delta: "Checking." }));
  res.write(frame(runId, 2, "agent", card(runId, ["submit"], { exchangeId: "ex-form", toolId: "forms.fill", title: "Fill in the form" })));
  res.write(frame(runId, 3, "agent", card(runId, ["confirm", "cancel"])));
  return true;
}

function writeEvents(req: IncomingMessage, res: import("node:http").ServerResponse, runId: string): void {
  const lastEventId = req.headers["last-event-id"] as string | undefined;
  res.writeHead(200, { "content-type": "text/event-stream" });
  // Two Tovu subscribers follow a durable run: the AG-UI segment (`node:http`, no user agent) and the
  // durable transcript watch (`run-daemon-http-client.ts` `openEvents`, global fetch, UA "node"),
  // which rightly stays attached to a live run. Only the segment's subscriptions are under test.
  if (req.headers["user-agent"] !== "node") {
    lastEventIds.push(lastEventId);
    openEventStreams++;
    // `res`, not `req`: an IncomingMessage closes once its body is read, not when the subscriber drops.
    res.on("close", () => { openEventStreams--; });
  }
  if (mode === "ordinary") {
    res.write(frame(runId, 1, "agent", card(runId, ["submit"])));
    res.write(frame(runId, 2, "agent", { type: "text_delta", delta: "Form shown." }));
    res.end(frame(runId, 3, "end", { reason: "stop", status: "succeeded" }));
    return;
  }
  if (mode === "mixed" && !writeMixedEvents(lastEventId, res, runId)) return;
  if (mode === "mixed") { holdStream(runId, res); return; }
  if (lastEventId === "2") {
    res.write(frame(runId, 3, "agent", { type: "text_delta", delta: "After approval." }));
    res.end(frame(runId, 4, "end", { reason: "stop", status: "succeeded" }));
    return;
  }
  // The held run: the card is the last frame until the human answers, so the stream stays open.
  res.write(frame(runId, 1, "agent", { type: "text_delta", delta: "Before card." }));
  res.write(frame(runId, 2, "agent", card(runId, ["confirm", "cancel"])));
  holdStream(runId, res);
}

function holdStream(runId: string, res: import("node:http").ServerResponse): void {
  const held = { runId, res };
  heldStreams.add(held);
  res.on("close", () => { heldStreams.delete(held); });
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

/** Unref'd timers the test can see and clear: a parked approval's expiry must not hold the test
 *  process open, and shutdown must cancel every one of them. */
function createVisibleScheduler() {
  const live = new Set<ReturnType<typeof setTimeout>>();
  return { live, schedule({ delayMs, callback }: { delayMs: number; callback: () => void }) {
    const timer = setTimeout(() => { live.delete(timer); callback(); }, delayMs);
    timer.unref();
    live.add(timer);
    return () => { clearTimeout(timer); live.delete(timer); };
  } };
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
  const approvalTimers = createVisibleScheduler();
  const approvals = createAdminAgUiApprovals({ nowMs: Date.now, scheduler: approvalTimers, newInterruptId: randomUUID, answerExchange: answerDaemonApprovalExchange });
  t.after(() => {
    approvals.shutdownAdminApprovals();
    for (const { runId, res } of [...heldStreams]) res.end(frame(runId, 99, "end", { reason: "stop", status: "canceled" }));
  });
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  createAssistantAgUiModule(deps, { approvals }).registerRoutes?.({ app });
  createAssistantModule({ routeDeps: Object.assign(deps, { assistantDaemonDemand: { ensureReady: async () => {}, isReady: () => true } }),
    byokSurfaceExchanges: createSurfaceExchangeStore({ scheduler, clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
  { approvals }).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  launches = []; cancels = []; answers = []; lastEventIds = []; openEventStreams = 0; mode = "approval";
  const cookie = await loginAsOwner(baseUrl);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as { user: { id: string } };
  const conversationId = `conv-${randomUUID()}`;
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: me.user.id }).create({ id: conversationId });
  return { baseUrl, cookie, deps, ownerId: me.user.id, conversationId, approvals, approvalTimers };
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
  const finished = events.at(-1) as { type: string; runId: string; outcome?: { type: string; interrupts: Array<{ id: string; reason: string; message?: string; metadata?: unknown }> } };
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
  assert.notEqual(interrupt.id, "ex-1", "the interrupt id is minted by the server, not the exchange id");
  assert.deepEqual(interrupt.metadata, { exchangeId: "ex-1" }, "names the rendered card the decision belongs to");
  const cards = first.events.flatMap((e, index) => (e.type === "CUSTOM" && e.name === "tovu.ext.mcp-ui" ? [index] : []));
  assert.equal(cards.length, 1, "the existing approval card streams, exactly as on the ordinary path");
  assert.ok(cards[0]! < first.events.length - 1, "the card comes before the interrupt");
  const second = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: first.runId, interruptId: interrupt.id }) });
  assert.equal(second.status, 200, second.text);
  const events = parse(second.text);
  assert.deepEqual(events[0], { type: "RUN_STARTED", threadId: conversationId, runId: "seg-2", parentRunId: first.runId });
  const text = events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta).join("");
  assert.equal(text, "After approval.", "neither the card nor earlier deltas repeat");
  assert.ok(!events.some((e) => e.type === "CUSTOM" && e.name === "tovu.ext.mcp-ui"), "the resumed segment does not repeat the card");
  assert.equal(events.at(-1)?.type, "RUN_FINISHED");
  assert.deepEqual(answers, [{ principal: ownerId, body: { toolName: "posts.delete", params: { __exchangeId: "ex-1", decision: "confirm" } } }]);
  assert.deepEqual(launches, [first.runId], "the same daemon run continues; nothing new starts");
  // Only the final reconnect is behavior; how many warm-up subscriptions preceded it is not.
  assert.equal(lastEventIds.at(-1), "2");
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
  const { baseUrl, cookie, conversationId, deps, ownerId } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  const interruptId = first.finished.outcome!.interrupts[0]!.id;
  const intruder = await loginAsBarePrincipal(deps as unknown as Parameters<typeof loginAsBarePrincipal>[0], baseUrl);
  const asIntruder = await resume({ baseUrl, cookie: intruder,
    body: resumeBody({ conversationId, parentRunId: first.runId, interruptId, extra: { forwardedProps: { agentId: "claude", owner: ownerId } } }) });
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
  assert.equal(openEventStreams, 0, "the interrupt segment detached from the daemon stream");
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

test("shutdown abandons every parked admin approval and clears its timer", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId, approvals, approvalTimers } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  assert.equal(approvalTimers.live.size, 1, "the park armed its expiry");
  approvals.shutdownAdminApprovals();
  assert.equal(approvalTimers.live.size, 0, "no expiry timer survives shutdown");
  const late = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: first.runId, interruptId: first.finished.outcome!.interrupts[0]!.id }) });
  assert.deepEqual([late.status, late.text, answers.length], [400, REFUSAL, 0], "nothing is answered after shutdown");
});

test("Stop before the resume settles the parked admin approval: the late resume answers nothing", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId } = await boot(t);
  const first = await startTurn({ baseUrl, cookie, conversationId });
  const stop = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(first.runId)}/cancel`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: "{}" });
  assert.equal(stop.status, 200);
  const late = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: first.runId, interruptId: first.finished.outcome!.interrupts[0]!.id }) });
  assert.deepEqual([late.status, late.text, answers.length], [400, REFUSAL, 0], "a stopped run's approval cannot be answered afterwards");
});

/** The admin client replays these exact bytes (`assistant-transport.ag-ui.approvals.unit.test.ts`),
 *  so this file pins them to the live route: a server change that alters the wire fails here until
 *  the golden is regenerated (`TOVU_UPDATE_AG_UI_GOLDEN=1`), and the regenerated golden then
 *  re-runs the client's acceptance. Random ids are numbered in order of first appearance so the
 *  pin compares structure, not luck. */
const GOLDEN = fileURLToPath(new URL("../../../../admin/src/lib/__tests__/fixtures/admin-ag-ui-approval-wire.golden.json", import.meta.url));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

type Recorded = { status: number; contentType: string; body: string };
async function record(res: Response): Promise<Recorded> {
  return { status: res.status, contentType: (res.headers.get("content-type") ?? "").split(";")[0]!, body: await res.text() };
}

test("admin AG-UI golden wire: the segments the admin client replays are the live server's bytes", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, conversationId } = await boot(t);
  mode = "mixed";
  const post = (body: string) => fetch(`${baseUrl}${RUN_PATH}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body });
  const firstSegment = await record(await post(JSON.stringify({ threadId: "client-thread", runId: "seg-1", messages: [{ role: "user", content: "delete it" }],
    forwardedProps: { agentId: "claude", durableRun: { conversationId, assistantMessageId: `msg-${randomUUID()}` } } })));
  const finished = parse(firstSegment.body).at(-1) as { runId: string; outcome?: { interrupts: Array<{ id: string }> } };
  const body = resumeBody({ conversationId, parentRunId: finished.runId, interruptId: finished.outcome!.interrupts[0]!.id });
  const resumeSegment = await record(await post(body));
  const refusal = await record(await post(body));
  const seen = new Map<string, string>();
  const live = JSON.parse(JSON.stringify({ firstSegment, resumeSegment, refusal }).replace(UUID, (id) => {
    if (!seen.has(id)) seen.set(id, `00000000-0000-4000-8000-${String(seen.size + 1).padStart(12, "0")}`);
    return seen.get(id)!;
  })) as Record<string, Recorded>;
  if (process.env.TOVU_UPDATE_AG_UI_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify(live, null, 2)}\n`);
  assert.deepEqual(live, JSON.parse(readFileSync(GOLDEN, "utf8")), "the live wire drifted from the golden the admin client replays");
  assert.deepEqual([firstSegment.status, resumeSegment.status, refusal.status], [200, 200, 400]);
  assert.deepEqual(answers.map((a) => a.body), [{ toolName: "posts.delete", params: { __exchangeId: "ex-1", decision: "confirm" } }]);
});

/** The visitor assistant's Ask-mode tool and a stub provider, on the deps `createApp` composes. */
async function enableVisitorAsk({ t, deps, siteOrigin }: { t: import("node:test").TestContext; deps: RouteDeps; siteOrigin: () => URL }) {
  const allow = async () => ({ allowed: true, reason: "test" });
  const providerRequests: unknown[] = [];
  await setPublicAssistantSettings({ settingsRepo: deps.settingsRepo, getEffective: deps.getEffective, set: setLegacySetting,
    clock: deps.clock, ids: deps.idGen, authorize: allow, principals: deps.principalRepo },
  { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" });
  await writeVisitorTools({ visitorTools: VISITOR_TOOLS_HOST, writePolicies: SETTINGS_WRITE_POLICIES, deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: allow, principals: deps.principalRepo },
    workspaceId: deps.workspaceId, callerPrincipalId: "test-caller", value: { version: 1, tools: { list_categories: { mode: "ask" } } } });
  deps.originRegistry.canonicalOrigin = async () => ({ scheme: "http", host: siteOrigin().hostname, port: Number(siteOrigin().port), source: "dev-capability", verifiedAt: deps.clock.nowIso() });
  const chunk = (payload: Record<string, unknown>) => `data: ${JSON.stringify(payload)}\n\n`;
  const providerUrl = await startStubProviderServer(t, (count: number, body: Record<string, unknown>) => {
    providerRequests.push(body);
    return count === 1
      ? { status: 200, body: chunk({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "list_categories", args: {}, id: "ask-call" } }] }, index: 0 }] }) }
      : { status: 200, body: chunk({ candidates: [{ content: { role: "model", parts: [{ text: "Finished." }] }, finishReason: "STOP", index: 0 }] }) };
  });
  await setSiteAssistantCredential({ repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
    { workspaceId: deps.workspaceId, apiKey: "test-fake-key-not-real", model: "gemini-flash-latest", baseUrl: providerUrl });
  const env = { GEMINI_API_KEY: "test-fake-key-not-real", TOVU_SITE_ASSISTANT_BASE_URL: providerUrl, TOVU_VISITOR_TOOLS_POLICY: "on" };
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  return { providerRequests };
}

/** Parks one visitor approval over the real `/chat` route and returns what a later resume needs. */
async function parkVisitorApproval({ baseUrl }: { baseUrl: string }) {
  const origin = { origin: baseUrl, "sec-fetch-site": "same-origin" };
  const issued = await fetch(`${baseUrl}/api/site-assistant/frontend-sessions/credentials`, { method: "POST", headers: origin });
  assert.equal(issued.status, 200);
  const { tabCredential } = await issued.json() as { tabCredential: string };
  const headers = { ...origin, cookie: issued.headers.get("set-cookie")!.split(";")[0]!, "x-frontend-tab": tabCredential, "content-type": "application/json", accept: "text/event-stream; agui=1" };
  const post = (body: Record<string, unknown>) => fetch(`${baseUrl}/api/site-assistant/chat`, { method: "POST", headers, body: JSON.stringify({ tools: [], context: [], state: {}, forwardedProps: {}, ...body }) });
  const started = parse((await (await post({ threadId: "thread-1", runId: "run-1", messages: [{ id: "m1", role: "user", content: "List the categories." }] })).text()).replace(/^:.*$/gm, ""));
  const interruptId = (started.at(-1) as { outcome?: { interrupts?: Array<{ id: string }> } }).outcome!.interrupts![0]!.id;
  return { lateAllow: () => post({ threadId: "thread-1", runId: "run-2", parentRunId: "run-1", messages: [], resume: [{ interruptId, status: "resolved", payload: "allow" }] }) };
}

test("server shutdown abandons every parked visitor and admin approval once", { timeout: 60_000 }, async (t) => {
  await boot(t);
  const { createApp, createRouteDeps } = await import("../runtime/composition/app.js");
  const deps = Object.assign(createRouteDeps(), { assistantDaemonDemand: { ensureReady: async () => {}, isReady: () => true } }) as RouteDeps;
  await deps.siteTitleReady;
  let siteOrigin: URL | undefined;
  const { providerRequests } = await enableVisitorAsk({ t, deps, siteOrigin: () => siteOrigin! });
  const shutdowns: Array<() => void> = [];
  // The serving process's shutdown path: createApp hands each process-local release to its host.
  const app = createApp(deps, { onShutdown: ({ shutdown }) => { shutdowns.push(shutdown); } });
  const baseUrl = await startTestServer(app, t);
  siteOrigin = new URL(baseUrl);
  const cookie = await loginAsOwner(baseUrl);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as { user: { id: string } };
  const conversationId = `conv-${randomUUID()}`;
  await deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: me.user.id }).create({ id: conversationId });

  const admin = await startTurn({ baseUrl, cookie, conversationId });
  const visitor = await parkVisitorApproval({ baseUrl });
  assert.equal(providerRequests.length, 1, "the visitor's tool is held, the model waits");
  for (const shutdown of [...shutdowns, ...shutdowns]) shutdown();

  const adminLate = await resume({ baseUrl, cookie, body: resumeBody({ conversationId, parentRunId: admin.runId, interruptId: admin.finished.outcome!.interrupts[0]!.id }) });
  assert.deepEqual([adminLate.status, adminLate.text, answers.length], [400, REFUSAL, 0], "the admin approval is gone after shutdown");
  const visitorLate = await visitor.lateAllow();
  assert.deepEqual([visitorLate.status, (await visitorLate.json() as { error: string }).error], [400, VISITOR_APPROVAL_EXPIRED], "the visitor approval is gone after shutdown");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(providerRequests.length, 1, "the held visitor call ended: no continuation ran");
});
