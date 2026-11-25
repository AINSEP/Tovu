import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/index.js";
import { resetAssistantDaemonSingletonForTests, startAssistantDaemon } from "../runtime/lifecycle/daemon-supervisor.js";
import type { RouteDeps } from "../routes/types.js";
import { startTestServer, loginAsOwner } from "./helpers/http-test-server.js";
import { parseRunStartContextRef } from "../../assistant/run-start-context.js";

/**
 * @file The AG-UI durable start against the REAL acceptance and the in-memory root's real SQLite
 * run ledger — only the daemon process is a stand-in. Proves the server half of the resume gate:
 * one accepted run per assistant message, one daemon launch, and `RUN_STARTED` naming the durable
 * run id rather than the client's per-request segment id; plus both halves of Stop: a durable
 * reader's disconnect closes only its subscription, while an explicit Stop through the real
 * `/api/runs/:runId/cancel` route (by message id before or during acceptance, by run id after)
 * cancels the owned daemon run exactly once. The stand-in daemon, like the real one, has no event
 * stream for a run it never launched, so an orphan subscribe cannot pass as a stopped run.
 */

const TOKEN = "e".repeat(64);
const launched = new Set<string>();
let launches: Array<{ runId?: string; idempotencyKey?: string; contextRef?: string }> = [];
let cancels: string[] = [];
let eventsMode: "answer" | "stays-open" | "held" = "answer";
let subscribed: (() => void) | null = null;
let release: (() => void) | null = null;
/** Event streams the stand-in leaves open (`stays-open`, `held`). The server's run finalizer follows
 *  every accepted run through the daemon's event stream and, when that stream drops without a
 *  terminal frame, keeps probing and re-adopting the run every reconnect delay; closing the
 *  stand-in alone therefore left those recovery loops' timers holding the test process open after
 *  every test had passed. Each test ends its open streams as a stopped run, so every follower
 *  settles before the next test and the process exits. */
const openStreams = new Set<{ runId: string; res: import("node:http").ServerResponse }>();
function keepOpen(runId: string, res: import("node:http").ServerResponse): void {
  const held = { runId, res };
  openStreams.add(held);
  res.on("close", () => { openStreams.delete(held); });
}

function frame(runId: string, kind: string, payload: unknown): string {
  return `event: ${kind}\ndata: ${JSON.stringify({ runId, eventId: "e", opaqueCursor: "0", protocolVersion: 1, ts: 0, kind, payload, durability: "durable" })}\n\n`;
}

async function startStandInDaemon(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const url = req.url ?? "";
      if (req.method === "POST" && url === "/api/runs") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { runId?: string; idempotencyKey?: string; contextRef?: string };
        launches.push(body);
        if (body.runId) launched.add(body.runId);
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ run: { id: body.runId } }));
        return;
      }
      const events = url.match(/^\/api\/runs\/([^/?]+)\/events/);
      if (events) {
        const runId = decodeURIComponent(events[1]!);
        // Like the real daemon, a run that was never launched has no event stream.
        if (!launched.has(runId)) { res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "run not found" })); return; }
        res.writeHead(200, { "content-type": "text/event-stream" });
        subscribed?.();
        if (eventsMode !== "answer") keepOpen(runId, res);
        if (eventsMode === "held" && !release) { res.flushHeaders(); release = () => res.end(frame(runId, "end", { reason: "cancelled", status: "canceled" })); return; }
        if (eventsMode === "stays-open") { res.write(frame(runId, "agent", { type: "text_delta", delta: "Still working." })); return; }
        res.write(frame(runId, "agent", { type: "text_delta", delta: "Durable answer." }));
        res.end(frame(runId, "end", { reason: "stop", status: "succeeded" }));
        return;
      }
      const cancel = url.match(/^\/api\/runs\/([^/?]+)\/cancel/);
      if (cancel) cancels.push(decodeURIComponent(cancel[1]!));
      const status = url.match(/^\/api\/runs\/([^/?]+)$/);
      if (status) { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ run: { id: status[1], status: "succeeded" } })); return; }
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
  t.after(() => { for (const { runId, res } of [...openStreams]) res.end(frame(runId, "end", { reason: "stop", status: "canceled" })); });
  const { createRouteDeps } = await import("../runtime/composition/app.js");
  const { createAssistantAgUiModule } = await import("../runtime/composition/modules/assistant-ag-ui.js");
  const { registerAuthRoutes } = await import("../inbound/admin-http/dev-auth.js");
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  createAssistantAgUiModule(deps, { reporter: { record: () => ({ errorId: "ERR-TEST" }) } }).registerRoutes?.({ app });
  // The real owned Stop route the admin dock posts to, so Stop is proven against the same ledger.
  const { createAssistantModule } = await import("../runtime/composition/modules/assistant.js");
  const { createSurfaceExchangeStore } = await import("@jini-ai/daemon/surface-exchanges");
  createAssistantModule({ routeDeps: Object.assign(deps, { assistantDaemonDemand: { ensureReady: async () => {}, isReady: () => true } }),
    byokSurfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  launches = []; cancels = []; eventsMode = "answer"; subscribed = null; release = null;
  const cookie = await loginAsOwner(baseUrl);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as { user: { id: string } };
  // The owner's conversation exists first, as the admin chat creates it before any run starts.
  const history = deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: me.user.id });
  for (const id of ["conv-attach-1", "conv-attach-2", "conv-attach-3", "conv-durable-1", "conv-durable-2", "conv-stop-1", "conv-stop-2", "conv-stop-3", "conv-stop-4"]) await history.create({ id });
  return { baseUrl, cookie, deps };
}

test.after(async () => { daemonServer?.closeAllConnections(); await new Promise<void>((resolve) => daemonServer ? daemonServer.close(() => resolve()) : resolve()); });

function durableBody({ conversationId, messageId }: { conversationId: string; messageId: string }) {
  return JSON.stringify({ threadId: "client-thread", runId: "client-segment-1", messages: [{ role: "user", content: "hello" }],
    forwardedProps: { agentId: "claude", durableRun: { conversationId, assistantMessageId: messageId } } });
}

function parse(text: string): Array<{ type: string; [key: string]: unknown }> {
  return text.split("\n\n").map((f) => f.trim()).filter(Boolean).map((f) => JSON.parse(f.replace(/^data:\s*/, "")) as { type: string });
}

test("reopening an AG-UI conversation follows its actual run without duplicate deltas", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, deps } = await boot(t);
  const post = async () => fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, { method: "POST", headers: { "content-type": "application/json", cookie },
    body: durableBody({ conversationId: "conv-durable-1", messageId: "msg-durable-1" }) });
  const first = await post();
  assert.equal(first.status, 200, await first.clone().text());
  const firstEvents = parse(await first.text());
  const accepted = await deps.chatRunLedger.durable!.load({ messageId: "msg-durable-1" }, {});
  assert.ok(accepted, "the run was durably accepted in the real ledger");
  const started = firstEvents.find((e) => e.type === "RUN_STARTED");
  assert.equal(started?.runId, accepted.runId, "RUN_STARTED names the durable run, not the client's segment");
  assert.equal(started?.threadId, "conv-durable-1");
  assert.equal(launches.length, 1);
  assert.equal(launches[0]?.idempotencyKey, accepted.runId);
  assert.doesNotMatch(launches[0]?.contextRef ?? "", /recoveryMode|recoverySessionId/);

  const reopened = parse(await (await post()).text());
  assert.equal(reopened.find((e) => e.type === "RUN_STARTED")?.runId, accepted.runId, "reopen follows the same accepted run");
  assert.equal(launches.length, 1, "reopen never launches a second executor");
  for (const events of [firstEvents, reopened]) {
    assert.equal(events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT" && e.delta === "Durable answer.").length, 1, "each stream carries each delta once");
  }
});

test("a durable AG-UI reader disconnect is a detach: it closes its subscription and never cancels the run", { timeout: 60_000 }, async (t) => {
  const { baseUrl, cookie, deps } = await boot(t);
  eventsMode = "stays-open";
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, { method: "POST", headers: { "content-type": "application/json", cookie },
    body: durableBody({ conversationId: "conv-durable-2", messageId: "msg-durable-2" }), signal: controller.signal });
  assert.equal(res.status, 200, "the durable run was accepted and is streaming");
  const reader = res.body!.getReader();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(cancels, [], "a disconnect is not an explicit Stop");
  const run = await deps.chatRunLedger.durable!.load({ messageId: "msg-durable-2" }, {});
  assert.equal(run?.cancelReason ?? null, null, "the owned run is not cancelled by a detach");
});

async function stopRun({ baseUrl, cookie }: { baseUrl: string; cookie: string }, { runId = "pending", messageId, conversationId }: { runId?: string; messageId?: string; conversationId?: string } = {}) {
  return fetch(`${baseUrl}/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(messageId && conversationId ? { messageId, conversationId } : {}) });
}

function postDurable({ baseUrl, cookie }: { baseUrl: string; cookie: string }, { conversationId, messageId, signal }: { conversationId: string; messageId: string; signal?: AbortSignal }) {
  return fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, { method: "POST", headers: { "content-type": "application/json", cookie },
    body: durableBody({ conversationId, messageId }), ...(signal ? { signal } : {}) });
}

async function readUntilStarted(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = "";
  while (!/RUN_STARTED/.test(text)) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += new TextDecoder().decode(chunk.value);
  }
  return String(parse(text).find((e) => e.type === "RUN_STARTED")?.runId ?? "");
}

test("Stop reaches an AG-UI run before headers, during subscribe, streaming and parked approval", { timeout: 60_000 }, async (t) => {
  const ctx = await boot(t);
  const ledger = ctx.deps.chatRunLedger.durable!;

  await t.test("before acceptance: Stop by message id leaves no orphan start and no error", async () => {
    assert.equal((await stopRun(ctx, { messageId: "msg-stop-1", conversationId: "conv-stop-1" })).status, 200);
    const res = await postDurable(ctx, { conversationId: "conv-stop-1", messageId: "msg-stop-1" });
    assert.equal(res.status, 200, await res.clone().text());
    const events = parse(await res.text());
    assert.equal(launches.length, 0, "a Stop that beat acceptance launches nothing");
    assert.equal(events.filter((e) => e.type === "RUN_ERROR").length, 0, "an intentional Stop is not an error banner");
    assert.equal(events.at(-1)?.type, "RUN_FINISHED");
    assert.equal((await ledger.load({ messageId: "msg-stop-1" }, {}))?.message.runStatus, "canceled");
  });

  await t.test("during subscribe: Stop by message id cancels the accepted run once", async () => {
    eventsMode = "held";
    const subscribing = new Promise<void>((resolve) => { subscribed = resolve; });
    const pending = postDurable(ctx, { conversationId: "conv-stop-2", messageId: "msg-stop-2" });
    await subscribing;
    assert.equal((await stopRun(ctx, { messageId: "msg-stop-2", conversationId: "conv-stop-2" })).status, 200);
    release?.();
    const events = parse(await (await pending).text());
    const run = await ledger.load({ messageId: "msg-stop-2" }, {});
    assert.equal(run?.cancelReason, "user-stop");
    assert.deepEqual(cancels, [run?.runId], "the daemon run is cancelled exactly once");
    assert.equal(launches.length, 1);
    assert.equal(events.filter((e) => e.type === "RUN_ERROR").length, 0);
  });

  await t.test("streaming: Stop by durable run id cancels the daemon run, not just the reader", async () => {
    cancels = []; launches = []; eventsMode = "stays-open";
    const controller = new AbortController();
    const res = await postDurable(ctx, { conversationId: "conv-stop-3", messageId: "msg-stop-3", signal: controller.signal });
    const reader = res.body!.getReader();
    const runId = await readUntilStarted(reader);
    assert.equal((await stopRun(ctx, { runId })).status, 200);
    controller.abort();
    await reader.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(cancels, [runId], "explicit Stop reaches the daemon run once; the reader close adds nothing");
    assert.equal((await ledger.load({ messageId: "msg-stop-3" }, {}))?.cancelReason, "user-stop");
  });
});

test("Stop after reopen cancels the owned run once", { timeout: 60_000 }, async (t) => {
  const ctx = await boot(t);
  eventsMode = "stays-open";
  const first = new AbortController();
  const firstReader = (await postDurable(ctx, { conversationId: "conv-stop-4", messageId: "msg-stop-4", signal: first.signal })).body!.getReader();
  const runId = await readUntilStarted(firstReader);
  first.abort();
  await firstReader.cancel().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(cancels, [], "a physical reload is a detach, not a Stop");

  const reopened = new AbortController();
  const reopenedReader = (await postDurable(ctx, { conversationId: "conv-stop-4", messageId: "msg-stop-4", signal: reopened.signal })).body!.getReader();
  assert.equal(await readUntilStarted(reopenedReader), runId, "reopen follows the same owned run");
  assert.equal((await stopRun(ctx, { runId })).status, 200);
  reopened.abort();
  await reopenedReader.cancel().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(cancels, [runId], "Stop after reopen cancels the owned run exactly once");
  assert.equal(launches.length, 1, "neither reopen nor Stop launches another executor");
  assert.equal((await ctx.deps.chatRunLedger.durable!.load({ messageId: "msg-stop-4" }, {}))?.cancelReason, "user-stop");
});

/** The launch fields the admin client's prepared start sends beside the durable identity; the
 *  `recoveryMode`/`principalId` pair is browser-owned authority the server must never copy. */
function attachmentBody({ conversationId, messageId, attachmentIds }: { conversationId: string; messageId: string; attachmentIds: string[] }) {
  return JSON.stringify({ threadId: "client-thread", runId: "client-segment-1", messages: [{ role: "user", content: "look at this" }],
    forwardedProps: { agentId: "claude", durableRun: { conversationId, assistantMessageId: messageId,
      launch: { attachmentIds, pluginRefIds: ["ui-ux-design"], model: "opus", recoveryMode: "native", principalId: "someone-else" } } } });
}

function postAttachment({ baseUrl, cookie }: { baseUrl: string; cookie: string }, body: string, signal?: AbortSignal) {
  return fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, { method: "POST", headers: { "content-type": "application/json", cookie }, body, ...(signal ? { signal } : {}) });
}

test("an AG-UI attachment reaches the selected agent and survives reopen and retry", { timeout: 60_000 }, async (t) => {
  const ctx = await boot(t);
  const ledger = ctx.deps.chatRunLedger.durable!;
  const send = { conversationId: "conv-attach-1", messageId: "msg-attach-1", attachmentIds: ["att-1", "att-2"] };

  const first = await postAttachment(ctx, attachmentBody(send));
  assert.equal(first.status, 200, await first.clone().text());
  const firstRunId = String(parse(await first.text()).find((e) => e.type === "RUN_STARTED")?.runId);
  assert.equal(launches.length, 1);
  // The daemon start decodes the launch with the real run-start parser: the same fields the
  // direct `/api/runs` start stages attachments from.
  const decoded = parseRunStartContextRef({ contextRef: launches[0]!.contextRef! });
  assert.deepEqual(decoded.attachmentIds, ["att-1", "att-2"], "canonical attachment refs reach the daemon start");
  assert.deepEqual(decoded.pluginRefIds, ["ui-ux-design"]);
  assert.equal(decoded.model, "opus");
  assert.equal(decoded.recoveryMode, undefined, "browser-owned recovery authority is stripped");
  assert.notEqual(decoded.principalId, "someone-else", "the verified principal replaces any claimed one");

  const stored = JSON.parse((await ledger.load({ messageId: send.messageId }, {}))!.request.contextRef) as { attachmentIds?: string[] };
  assert.deepEqual(stored.attachmentIds, ["att-1", "att-2"], "the accepted (persisted) input retains the attachment");

  // Reopen and a retry that carries no attachment: same run, same retained input, one executor.
  const reopened = await postAttachment(ctx, attachmentBody({ ...send, attachmentIds: [] }));
  assert.equal(String(parse(await reopened.text()).find((e) => e.type === "RUN_STARTED")?.runId), firstRunId);
  assert.equal(launches.length, 1, "reopen and retry never launch a second executor");
  const reread = JSON.parse((await ledger.load({ messageId: send.messageId }, {}))!.request.contextRef) as { attachmentIds?: string[] };
  assert.deepEqual(reread.attachmentIds, ["att-1", "att-2"], "the reopened transcript keeps the same attachment");
});

test("an AG-UI Stop of one run leaves another run's attachments and staging untouched", { timeout: 60_000 }, async (t) => {
  const ctx = await boot(t);
  eventsMode = "stays-open";
  const ledger = ctx.deps.chatRunLedger.durable!;
  const readers: Array<ReadableStreamDefaultReader<Uint8Array>> = [];
  const runIds: string[] = [];
  for (const [conversationId, messageId, att] of [["conv-attach-2", "msg-attach-2", "att-a"], ["conv-attach-3", "msg-attach-3", "att-b"]] as const) {
    const res = await postAttachment(ctx, attachmentBody({ conversationId, messageId, attachmentIds: [att] }));
    readers.push(res.body!.getReader());
    runIds.push(await readUntilStarted(readers.at(-1)!));
  }
  assert.equal((await stopRun(ctx, { runId: runIds[0]! })).status, 200);
  assert.deepEqual(cancels, [runIds[0]], "only the stopped run is cancelled");
  const other = await ledger.load({ messageId: "msg-attach-3" }, {});
  assert.equal(other?.cancelReason ?? null, null);
  assert.deepEqual((JSON.parse(other!.request.contextRef) as { attachmentIds?: string[] }).attachmentIds, ["att-b"]);
  assert.deepEqual(parseRunStartContextRef({ contextRef: launches[1]!.contextRef! }).attachmentIds, ["att-b"], "each run stages only its own attachments");
  for (const reader of readers) await reader.cancel().catch(() => undefined);
});
