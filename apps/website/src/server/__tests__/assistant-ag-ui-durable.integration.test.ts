import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/index.js";
import { resetAssistantDaemonSingletonForTests, startAssistantDaemon } from "../runtime/lifecycle/daemon-supervisor.js";
import type { RouteDeps } from "../routes/types.js";
import { startTestServer, loginAsOwner } from "./helpers/http-test-server.js";

/**
 * @file The AG-UI durable start against the REAL acceptance and the in-memory root's real SQLite
 * run ledger — only the daemon process is a stand-in. Proves the server half of the resume gate:
 * one accepted run per assistant message, one daemon launch, and `RUN_STARTED` naming the durable
 * run id rather than the client's per-request segment id; plus the detach half of Stop: a durable
 * reader's disconnect closes only its subscription.
 */

const TOKEN = "e".repeat(64);
let launches: Array<{ runId?: string; idempotencyKey?: string; contextRef?: string }> = [];
let cancels: string[] = [];
let eventsMode: "answer" | "stays-open" = "answer";
let subscribed: (() => void) | null = null;

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
        res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ run: { id: body.runId } }));
        return;
      }
      const events = url.match(/^\/api\/runs\/([^/?]+)\/events/);
      if (events) {
        const runId = decodeURIComponent(events[1]!);
        res.writeHead(200, { "content-type": "text/event-stream" });
        subscribed?.();
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
  const { createRouteDeps } = await import("../runtime/composition/app.js");
  const { createAssistantAgUiModule } = await import("../runtime/composition/modules/assistant-ag-ui.js");
  const { registerAuthRoutes } = await import("../inbound/admin-http/dev-auth.js");
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes({ app, deps });
  createAssistantAgUiModule(deps).registerRoutes?.({ app });
  const baseUrl = await startTestServer(app, t);
  launches = []; cancels = []; eventsMode = "answer"; subscribed = null;
  const cookie = await loginAsOwner(baseUrl);
  const me = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json()) as { user: { id: string } };
  // The owner's conversation exists first, as the admin chat creates it before any run starts.
  const history = deps.chatHistory({ kind: "user", workspaceId: deps.workspaceId, userId: me.user.id });
  for (const id of ["conv-durable-1", "conv-durable-2"]) await history.create({ id });
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
