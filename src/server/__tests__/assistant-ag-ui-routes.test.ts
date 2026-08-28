import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/index.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../runtime/lifecycle/readiness-state.js";
import type { RouteDeps } from "../routes/types.js";
import { startTestServer, loginAsOwner } from "./helpers/http-test-server.js";

/**
 * @file Route-level round trip for `assistant-ag-ui.ts` (ADR-059): a real Express app, a stand-in
 * agent daemon recording what arrives, and a real client-facing HTTP request against
 * `AG_UI_RUN_PATH` — proving the whole chain (session gate -> daemon run start -> daemon SSE
 * subscribe -> AG-UI translation -> AG-UI SSE response) works end to end, not just that the pure
 * translator functions are individually correct (see `assistant-ag-ui-translate.test.ts` for
 * those). Mirrors `assistant-proxy-routes.test.ts`'s stand-in-daemon harness pattern.
 *
 * The scripted daemon stream below is deliberately the ADR-059 Decision 6 interruption sequence
 * (text -> tool_use -> tool_result -> text again) — this is the one round trip that most needs
 * end-to-end proof, since `assistant-ag-ui-translate.test.ts` already proves the pure function is
 * correct in isolation; this test proves the ROUTE actually calls it the way the daemon's real
 * frame ordering would drive it, through real SSE parsing on both the daemon-subscribe and
 * client-response sides.
 */

const TOKEN = "f".repeat(64);

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let recorded: RecordedRequest[] = [];

/** `AGENT_DAEMON_URL` is resolved ONCE at `assistant-daemon-client.ts` module scope (its own doc),
 *  so every test in this file talks to the SAME long-lived stand-in daemon server — there is no way
 *  to point a later test at a differently-configured daemon instance. These two flags are how tests
 *  steer that one daemon's behavior instead: each test sets what it needs right after `bootAgUi`
 *  (which resets both to their defaults), the daemon handler below reads them per-request. */
type StartRunBehavior = "ok" | "http-failure" | "delayed-ok";
type EventsBehavior =
  | "normal"
  | "http-failure"
  | "stdout-and-unknown-frame"
  | "socket-reset-mid-stream"
  | "error-frame-no-message"
  | "end-frame-no-reason"
  | "end-frame-max-tool-turns"
  | "keepalive-frame"
  | "stays-open-until-aborted"
  | "delayed-then-normal";
let startRunBehavior: StartRunBehavior = "ok";
let eventsBehavior: EventsBehavior = "normal";

// Real daemon frames are the FULL `RunProtocolEventWire` envelope
// (`{runId, eventId, opaqueCursor, protocolVersion, ts, kind, payload, durability}` —
// `@jini-ai/http-kit`), never the bare payload — a flat fixture here would hide exactly the
// envelope-unwrap bug this test caught live (2026-08-18): every real "agent"/"end" frame fell
// through `assistant-ag-ui.ts`'s translator's `default` case because it read fields straight off
// the envelope instead of `.payload`. Match the real shape so this fixture can't drift back into
// hiding that bug again.
function wireFrame(kind: string, payload: unknown): string {
  return JSON.stringify({ runId: "daemon-run-1", eventId: "e", opaqueCursor: "0", protocolVersion: 1, ts: 0, kind, payload, durability: "durable" });
}

/** One entry per {@link EventsBehavior} — each writes its own scripted SSE response and ends the
 *  request. Split out of `startStandInDaemon`'s request handler so its own cost is just the
 *  dispatch, not every script's body. */
const EVENTS_SCRIPTS: Record<Exclude<EventsBehavior, "http-failure" | "delayed-then-normal">, (req: IncomingMessage, res: ServerResponse) => void> = {
  normal: (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "Let me check that." })}\n\n`);
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "tool_use", id: "call-1", name: "search", input: { q: "posts" } })}\n\n`);
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "tool_result", toolUseId: "call-1", content: "found 3", isError: false })}\n\n`);
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "Found 3 posts." })}\n\n`);
    res.write(`event: end\ndata: ${wireFrame("end", { reason: "stop" })}\n\n`);
    res.end();
  },
  "stdout-and-unknown-frame": (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: stdout\ndata: ${wireFrame("stdout", { chunk: "raw stdout line" })}\n\n`);
    // `heartbeat` is not a kind `handleDaemonFrame` recognizes — it must be silently ignored, not
    // drop or corrupt the rest of the stream.
    res.write(`event: heartbeat\ndata: ${wireFrame("heartbeat", {})}\n\n`);
    // `thinking_start` reduces to `null` (no wire-side `thinking_end` to pair it with) — a real
    // daemon "agent" frame whose reduction produces no AG-UI event at all, not just a pure-function
    // case.
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "thinking_start" })}\n\n`);
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "after unknown frame" })}\n\n`);
    res.write(`event: end\ndata: ${wireFrame("end", { reason: "stop" })}\n\n`);
    res.end();
  },
  "end-frame-max-tool-turns": (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "working on it" })}\n\n`);
    res.write(`event: end\ndata: ${wireFrame("end", { reason: "max_tool_turns" })}\n\n`);
    res.end();
  },
  "keepalive-frame": (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    // A bare `id:`-only frame with no `data:` line at all — `parseDaemonFrame` returns `null` for
    // it and `readDaemonSseFrames` must skip yielding it entirely, not choke on it or drop the
    // frames around it.
    res.write(`id: 0\n\n`);
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "after keepalive" })}\n\n`);
    res.write(`event: end\ndata: ${wireFrame("end", { reason: "stop" })}\n\n`);
    res.end();
  },
  "stays-open-until-aborted": (_req, res) => {
    // Deliberately never ends — this script's whole point is a run that's genuinely still in
    // progress when the client (the "Stop" button) aborts, so a test can prove `res.on("close")`
    // reaching the daemon's own `/cancel` endpoint, not merely the local SSE reader being torn down.
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "partial" })}\n\n`);
  },
  "socket-reset-mid-stream": (req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "partial" })}\n\n`);
    // Simulates a network drop mid-run: no clean "end" frame, the connection just dies. Deferred a
    // tick so the client's `fetch()` has already resolved with a 200 and started reading the body
    // — destroying synchronously here races the client's own header parsing and can fail the whole
    // `fetch()` call instead of erroring the body stream mid-read.
    setTimeout(() => req.socket.destroy(), 50);
  },
  "error-frame-no-message": (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "partial" })}\n\n`);
    // No `message` field at all — an explicit daemon "error" frame, not a transport failure, whose
    // payload happens to omit the field `RUN_ERROR`'s text comes from.
    res.write(`event: error\ndata: ${wireFrame("error", {})}\n\n`);
    res.end();
  },
  "end-frame-no-reason": (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`event: agent\ndata: ${wireFrame("agent", { type: "text_delta", delta: "done" })}\n\n`);
    // No `reason` field — a well-formed "end" frame whose payload omits it.
    res.write(`event: end\ndata: ${wireFrame("end", {})}\n\n`);
    res.end();
  },
};

/** Stand-in agent daemon: records every inbound request, answers `POST /api/runs` with a run id,
 *  and streams a scripted SSE sequence for `GET /api/runs/<id>/events` — both shaped by
 *  {@link startRunBehavior}/{@link eventsBehavior} above. */
async function startStandInDaemon(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      recorded.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });

      if (req.method === "POST" && req.url === "/api/runs") {
        if (startRunBehavior === "http-failure") {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "daemon rejected the run" }));
          return;
        }
        if (startRunBehavior === "delayed-ok") {
          // Holds the response open long enough for a test to abort the CLIENT-facing request
          // while the server is still inside its own `await startDaemonRun(...)` — proving the
          // orphan-cancellation window that exists BEFORE a `daemonRunId` is even known. The
          // request is still recorded above (before this branch), so the run's existence is
          // observable even though this client never sees the reply.
          setTimeout(() => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ run: { id: "daemon-run-1" } }));
          }, 200);
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ run: { id: "daemon-run-1" } }));
        return;
      }
      if ((req.url ?? "").includes("/runs/daemon-run-1/events")) {
        if (eventsBehavior === "http-failure") {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "daemon events endpoint failed" }));
          return;
        }
        if (eventsBehavior === "delayed-then-normal") {
          // Holds the subscribe response open so a test can abort while the server is inside its
          // own `await subscribeToDaemonEvents(...)` — strictly after the daemon run already
          // exists, but strictly before any SSE frame (or even response headers) reaches the
          // client. Distinct from "stays-open-until-aborted", which aborts only after a frame has
          // already been read.
          setTimeout(() => EVENTS_SCRIPTS.normal(req, res), 200);
          return;
        }
        EVENTS_SCRIPTS[eventsBehavior](req, res);
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found in stand-in daemon" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, server };
}

/** Splits a raw AG-UI SSE response body (`data: <json>\n\n` frames, no `event:` field) into parsed
 *  events, in order — the test's own minimal reader, independent of the route's internal one, so a
 *  bug shared between both wouldn't hide behind a shared parser. */
function parseAgUiResponseBody(text: string): Array<{ type: string; [key: string]: unknown }> {
  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0)
    .map((frame) => JSON.parse(frame.replace(/^data:\s*/, "")) as { type: string; [key: string]: unknown });
}

let harnessPromise: Promise<{ buildApp: () => express.Express; daemon: Server }> | null = null;
function harness() {
  harnessPromise ??= (async () => {
    const { origin, server } = await startStandInDaemon();
    process.env.JINI_AGENT_DAEMON_URL = origin;
    process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;

    const { createRouteDeps } = await import("../runtime/composition/app.js");
    const { createAssistantAgUiModule } = await import("../runtime/composition/modules/assistant-ag-ui.js");
    const { registerAuthRoutes } = await import("../middleware/dev-auth.js");

    return {
      daemon: server,
      buildApp: () => {
        const deps: RouteDeps = createRouteDeps();
        const app = express();
        app.use(express.json());
        registerAuthRoutes(app, deps);
        createAssistantAgUiModule(deps).registerRoutes?.(app);
        return app;
      },
    };
  })();
  return harnessPromise;
}

async function bootAgUi(t: import("node:test").TestContext) {
  const { buildApp } = await harness();
  recorded = [];
  startRunBehavior = "ok";
  eventsBehavior = "normal";
  const baseUrl = await startTestServer(buildApp(), t);
  const cookie = await loginAsOwner(baseUrl);
  return { baseUrl, cookie };
}

test.after(async () => {
  const built = await harnessPromise;
  if (built) await new Promise<void>((resolve) => built.daemon.close(() => resolve()));
});

test("the route is session-gated — no cookie means 401 and the daemon is never called", async (t) => {
  const { baseUrl } = await bootAgUi(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 401);
  assert.equal(recorded.length, 0, "an unauthenticated caller must never reach the daemon");
});

test("a request with no trailing user message is rejected before the daemon is ever touched", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "assistant", content: "hello" }] }),
  });

  assert.equal(res.status, 400);
  assert.equal(recorded.length, 0);
});

test("starting a run stamps the session principal into contextRef, same as the Local CLI path", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ threadId: "thread-1", runId: "client-run-1", messages: [{ role: "user", content: "find my posts" }] }),
  });

  const startCall = recorded.find((r) => r.method === "POST" && r.url === "/api/runs");
  assert.ok(startCall, "the daemon's run-start endpoint must have been called");
  assert.equal(startCall?.headers.authorization, `Bearer ${TOKEN}`);
  const startBody = JSON.parse(startCall?.body ?? "{}") as { contextRef: string };
  const contextRef = JSON.parse(startBody.contextRef) as { prompt: string; principalId: string };
  assert.match(contextRef.prompt, /find my posts/);
  assert.ok(contextRef.principalId.length > 0, "a real session-verified principal id must be stamped");
});

test("full round trip: daemon frames -> real AG-UI SSE events, including the interruption sequence", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ threadId: "thread-1", runId: "client-run-1", messages: [{ role: "user", content: "find my posts" }] }),
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/event-stream/);
  const events = parseAgUiResponseBody(await res.text());
  const types = events.map((e) => e.type);

  assert.deepEqual(types, [
    "RUN_STARTED",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "TOOL_CALL_START",
    "TOOL_CALL_ARGS",
    "TOOL_CALL_END",
    "TOOL_CALL_RESULT",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
  ]);

  // The client-supplied ids are echoed verbatim (ADR-059 Consequences: run-id ownership is
  // client-side for this path), not replaced by the daemon's own internal run id.
  assert.equal(events[0]?.runId, "client-run-1");
  assert.equal(events[0]?.threadId, "thread-1");
  assert.equal(events[events.length - 1]?.runId, "client-run-1");

  // The two TEXT_MESSAGE_START events must carry DIFFERENT messageIds — a real message boundary,
  // not the same message reopened (ADR-059 Decision 6).
  const starts = events.filter((e) => e.type === "TEXT_MESSAGE_START");
  assert.equal(starts.length, 2);
  assert.notEqual(starts[0]?.messageId, starts[1]?.messageId);

  // Tool call correlation survives the round trip intact.
  const toolStart = events.find((e) => e.type === "TOOL_CALL_START");
  const toolResult = events.find((e) => e.type === "TOOL_CALL_RESULT");
  assert.equal(toolStart?.toolCallId, "call-1");
  assert.equal(toolResult?.toolCallId, "call-1");
  assert.equal(toolResult?.content, "found 3");
});

test("messages that isn't an array at all is rejected the same as an empty/malformed one", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: "not an array" }),
  });

  assert.equal(res.status, 400);
  assert.equal(recorded.length, 0);
});

test("malformed history entries are filtered out; a valid trailing user message still starts the run", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      messages: [
        null,
        "not an object",
        { role: "system", content: "invalid role" },
        { role: "user", content: "" },
        { role: "user", content: 42 },
        { role: "user", content: "the real question" },
      ],
    }),
  });

  assert.equal(res.status, 200);
  const startCall = recorded.find((r) => r.method === "POST" && r.url === "/api/runs");
  const contextRef = JSON.parse(JSON.parse(startCall?.body ?? "{}").contextRef) as { prompt: string };
  assert.match(contextRef.prompt, /the real question/);
  assert.doesNotMatch(contextRef.prompt, /invalid role/);
});

test("history longer than 40 messages is truncated to the trailing 40 before reaching the daemon", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  const messages = Array.from({ length: 45 }, (_, i) => ({ role: "user" as const, content: `message-${i}` })).map((m, i, arr) =>
    i === arr.length - 1 ? m : { role: "assistant" as const, content: m.content },
  );
  // Ensure the array still ends on a user message (the one hard requirement) after the alternation above.
  messages[messages.length - 1] = { role: "user", content: "message-44" };

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages }),
  });

  assert.equal(res.status, 200);
  const startCall = recorded.find((r) => r.method === "POST" && r.url === "/api/runs");
  const contextRef = JSON.parse(JSON.parse(startCall?.body ?? "{}").contextRef) as { prompt: string };
  // Only the last 40 of the 45 sent messages survive (message-0..message-4 dropped).
  assert.doesNotMatch(contextRef.prompt, /message-4\n/);
  assert.match(contextRef.prompt, /message-5/);
  assert.match(contextRef.prompt, /message-44/);
});

test("omitted threadId/runId are minted server-side; an explicit forwardedProps.agentId is forwarded to the daemon", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  // A real RunAgentInput (what @ag-ui/client's HttpAgent actually sends) has no top-level
  // `agentId` field — Tovu's agent selector rides in `forwardedProps.agentId`, that schema's own
  // documented passthrough extension point.
  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], forwardedProps: { agentId: "custom-agent" } }),
  });

  assert.equal(res.status, 200);
  const events = parseAgUiResponseBody(await res.text());
  const runStarted = events[0] as { threadId?: string; runId?: string };
  assert.ok(runStarted.threadId && runStarted.threadId.length > 0);
  assert.ok(runStarted.runId && runStarted.runId.length > 0);

  const startCall = recorded.find((r) => r.method === "POST" && r.url === "/api/runs");
  const startBody = JSON.parse(startCall?.body ?? "{}") as { agentId?: string };
  assert.equal(startBody.agentId, "custom-agent");
});

test("a missing or malformed forwardedProps does not crash — agentId is simply absent from the daemon call", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    // No `forwardedProps` at all — the field is optional on the wire; a genuine RunAgentInput
    // sender always includes it, but this route must not assume that.
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], forwardedProps: "not an object" }),
  });

  assert.equal(res.status, 200);
  const startCall = recorded.find((r) => r.method === "POST" && r.url === "/api/runs");
  const startBody = JSON.parse(startCall?.body ?? "{}") as { agentId?: string };
  assert.equal(startBody.agentId, undefined);
});

test("an empty-string threadId/runId is treated the same as omitted — server mints real ids, not empty strings", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ threadId: "", runId: "", messages: [{ role: "user", content: "hi" }] }),
  });

  const events = parseAgUiResponseBody(await res.text());
  const runStarted = events[0] as { threadId?: string; runId?: string };
  assert.notEqual(runStarted.threadId, "");
  assert.notEqual(runStarted.runId, "");
});

test("a non-ok daemon response to POST /api/runs surfaces as DAEMON_START_FAILED with the daemon's own status; events endpoint is never reached", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  startRunBehavior = "http-failure";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 500);
  const payload = (await res.json()) as { code: string };
  assert.equal(payload.code, "DAEMON_START_FAILED");
  assert.ok(!recorded.some((r) => (r.url ?? "").includes("/events")), "the events endpoint must never be reached after a start failure");
});

test("a non-ok daemon response to the events subscribe request surfaces as a 502 BAD_GATEWAY", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "http-failure";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 502);
  const payload = (await res.json()) as { code: string };
  assert.equal(payload.code, "BAD_GATEWAY");
});

test("a stdout frame renders as RAW, and an unrecognized frame kind (e.g. a heartbeat) is silently skipped", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "stdout-and-unknown-frame";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 200);
  const events = parseAgUiResponseBody(await res.text());
  const types = events.map((e) => e.type);
  // The RAW stdout frame renders, the unrecognized "heartbeat" frame produces no event at all (not
  // an error, not a dropped stream), and the stream continues normally afterward to RUN_FINISHED.
  assert.deepEqual(types, ["RUN_STARTED", "RAW", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]);
  const rawEvent = events.find((e) => e.type === "RAW") as { event?: string };
  assert.equal(rawEvent.event, "raw stdout line");
});

test("the daemon connection dropping mid-stream (no clean end frame) closes any open message and emits RUN_ERROR", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "socket-reset-mid-stream";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 200);
  const events = parseAgUiResponseBody(await res.text());
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_ERROR"]);
});

test("an explicit daemon 'error' frame with no message field falls back to a generic RUN_ERROR message", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "error-frame-no-message";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 200);
  const events = parseAgUiResponseBody(await res.text());
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_ERROR"]);
  const errorEvent = events.find((e) => e.type === "RUN_ERROR") as { message?: string };
  assert.equal(errorEvent.message, "agent run failed");
});

test("an 'end' frame with no reason field defaults RUN_FINISHED's result reason to 'stop'", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "end-frame-no-reason";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 200);
  const events = parseAgUiResponseBody(await res.text());
  const finished = events.find((e) => e.type === "RUN_FINISHED") as { result?: { reason?: string } };
  assert.equal(finished.result?.reason, "stop");
});

test("an 'end' frame with reason max_tool_turns emits a terminal-reason notice before closing the run", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "end-frame-max-tool-turns";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 200);
  const events = parseAgUiResponseBody(await res.text());
  const types = events.map((e) => e.type);
  // The notice renders as its own TEXT_MESSAGE segment (status -> CUSTOM tovu.status is the wire
  // shape, but a max_tool_turns notice specifically is a `status` AgentEvent routed through
  // CUSTOM tovu.status, not a text message — see `terminalReasonNotice`'s own doc).
  assert.ok(types.includes("CUSTOM"), `expected a CUSTOM tovu.status notice event, got: ${types.join(", ")}`);
  const notice = events.find((e) => e.type === "CUSTOM" && (e as { name?: string }).name === "tovu.status") as {
    value?: { label?: string };
  };
  assert.match(notice.value?.label ?? "", /tool-step limit reached/);
  const finished = events.find((e) => e.type === "RUN_FINISHED") as { result?: { reason?: string } };
  assert.equal(finished.result?.reason, "max_tool_turns");
});

test("a known-failed daemon short-circuits this route too — startDaemonRun's own null-from-fetchAgentDaemon branch, not just the shared helper's", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  // Same mechanism `assistant-proxy-routes.test.ts` uses for the Local CLI path — proves the
  // short-circuit that lives in the SHARED `fetchAgentDaemon` also propagates correctly through
  // this route's own `startDaemonRun` (`if (!startUpstream) return { ok: false }`), not just that
  // the shared helper itself writes a 503.
  recordAssistantDaemonFailure("agent daemon could not bind 127.0.0.1:4319 — address already in use");
  t.after(() => clearAssistantDaemonFailure());

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 503);
  const payload = (await res.json()) as { code: string };
  assert.equal(payload.code, "AGENT_DAEMON_KNOWN_FAILED");
  assert.equal(recorded.length, 0, "the healthy stand-in daemon must never be reached once known-failed");
});

test("a bare keepalive frame (no data: line) from the daemon is silently skipped, not yielded as a frame", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "keepalive-frame";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });

  assert.equal(res.status, 200);
  const events = parseAgUiResponseBody(await res.text());
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]);
});

/** Polls `recorded` for the daemon's own `/cancel` endpoint — the fix under test fires it from a
 *  `res.on("close")` handler, an async event the client-side `fetch()` above cannot itself await.
 *  `waitMs` defaults to a generous 2s for positive assertions (waiting for a call that should
 *  arrive); pass a shorter window for a NEGATIVE assertion ("no call ever lands"), since that case
 *  always pays the full wait — 300ms is ample for a same-process, localhost round trip. */
async function waitForRecordedCancelCall(daemonRunId: string, waitMs = 2000): Promise<RecordedRequest | undefined> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const found = recorded.find((r) => r.method === "POST" && r.url === `/api/runs/${daemonRunId}/cancel`);
    if (found || Date.now() >= deadline) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * MEDIUM audit finding (2026-08-19, Codex sol bug/architecture audit): the AG-UI Stop action used
 * to abort only the browser's own SSE subscription (`reader.cancel()`); it never called the
 * daemon's own `/api/runs/:runId/cancel` endpoint the way the non-AG-UI (Local CLI) path already
 * does (`assistant.ts`'s `/api/runs/:runId/cancel` route). A user pressing Stop saw the UI detach
 * while the daemon kept executing the run — including tool calls with real side effects — to
 * completion, unobserved.
 */
test("Stop (the client aborting mid-stream) calls the daemon's own /cancel endpoint, not just the local SSE reader", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "stays-open-until-aborted";

  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    signal: controller.signal,
  });
  assert.equal(res.status, 200);

  // Read the first frame so the stream is provably open and mid-run before aborting — proves this
  // is a genuine "Stop while running" abort, not a race against the response never having started.
  const reader = res.body!.getReader();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => undefined);

  const cancelCall = await waitForRecordedCancelCall("daemon-run-1");
  assert.ok(cancelCall, `expected a POST /api/runs/daemon-run-1/cancel call; recorded requests: ${JSON.stringify(recorded.map((r) => `${r.method} ${r.url}`))}`);
  assert.equal(cancelCall?.headers.authorization, `Bearer ${TOKEN}`, "the cancel call must carry the same daemon bearer token every other proxied call does");
});

/**
 * MEDIUM audit finding, RE-AUDIT (2026-08-19, `gpt-5.6-sol` and `gpt-5.6-terra` independently): the
 * fix above only armed `res.on("close")` after BOTH `startDaemonRun` and `subscribeToDaemonEvents`
 * had already resolved. This test targets the FIRST of the two uncovered windows it left open: a
 * client abort while the server is still inside `await startDaemonRun(...)`, before a `daemonRunId`
 * even exists to cancel. In the pre-fix code this was missed permanently — there was nothing
 * registered yet to hear `"close"`, and by the time registration happened the daemon run already
 * existed with no listener left to catch a `"close"` that had already fired.
 */
test("abort while the daemon run is still starting still cancels it once it exists", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  startRunBehavior = "delayed-ok"; // holds POST /api/runs open past when the abort below fires

  const controller = new AbortController();
  const fetchPromise = fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    signal: controller.signal,
  });
  // 30ms is well inside the mock daemon's 200ms `delayed-ok` hold, so the abort below always lands
  // while the server is still awaiting the daemon's run-start response.
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(fetchPromise, "the client's own fetch must observe the abort");

  const cancelCall = await waitForRecordedCancelCall("daemon-run-1");
  assert.ok(
    cancelCall,
    `expected a POST /api/runs/daemon-run-1/cancel call once the daemon run existed; recorded requests: ${JSON.stringify(recorded.map((r) => `${r.method} ${r.url}`))}`,
  );
});

/**
 * MEDIUM audit finding, RE-AUDIT (2026-08-19): the SECOND uncovered window — a client abort while
 * the server is inside `await subscribeToDaemonEvents(...)`, strictly after the daemon run already
 * exists but strictly before any SSE frame (or even response headers) reaches this client. Distinct
 * from the "Stop" test above, which aborts only after a frame has already been read.
 */
test("abort while waiting to subscribe to the daemon's event stream still cancels the run", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "delayed-then-normal"; // startRunBehavior stays "ok": the run itself starts immediately

  const controller = new AbortController();
  const fetchPromise = fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(fetchPromise, "the client's own fetch must observe the abort");

  const cancelCall = await waitForRecordedCancelCall("daemon-run-1");
  assert.ok(
    cancelCall,
    `expected a POST /api/runs/daemon-run-1/cancel call; recorded requests: ${JSON.stringify(recorded.map((r) => `${r.method} ${r.url}`))}`,
  );
});

/**
 * MEDIUM audit finding, RE-AUDIT (2026-08-19): the THIRD gap — a subscribe HTTP failure (the 502
 * BAD_GATEWAY case already covered above) ends this response NORMALLY from the server's own point
 * of view, so the pre-fix `!res.writableEnded` guard could not tell it apart from an ordinary
 * successful completion and never fired a cancel, even though the daemon run it just started keeps
 * executing with nobody left to observe it.
 */
test("a subscribe HTTP failure still cancels the daemon run that already started", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  eventsBehavior = "http-failure";

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(res.status, 502);

  const cancelCall = await waitForRecordedCancelCall("daemon-run-1");
  assert.ok(
    cancelCall,
    `expected a POST /api/runs/daemon-run-1/cancel call after a subscribe failure; recorded requests: ${JSON.stringify(recorded.map((r) => `${r.method} ${r.url}`))}`,
  );
});

/**
 * The negative case the previous fix's own regression coverage never actually asserted (it relied
 * on unrelated tests flaking when a redundant cancel call leaked onto the shared stand-in daemon's
 * request log) — a genuinely successful run must issue ZERO cancel calls.
 */
test("a normal successful run never calls the daemon's /cancel endpoint", async (t) => {
  const { baseUrl, cookie } = await bootAgUi(t);
  // eventsBehavior stays "normal" (bootAgUi's default): a full, clean run to completion.

  const res = await fetch(`${baseUrl}/api/admin/v1/assistant/ag-ui-run`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(res.status, 200);
  await res.text(); // drain the body so the response — and therefore "close" — actually completes

  const cancelCall = await waitForRecordedCancelCall("daemon-run-1", 300);
  assert.equal(cancelCall, undefined, "a normal completion must not also fire a redundant cancel call");
});
