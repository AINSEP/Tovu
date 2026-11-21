import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, request, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";
import { createAgUiFetchAgent } from "@jini-ai/chat/transports/ag-ui";

import { AGENT_DAEMON_TOKEN_ENV_VAR } from "../../assistant/index.js";
import { resetAssistantDaemonSingletonForTests, startAssistantDaemon } from "../runtime/lifecycle/daemon-supervisor.js";
import type { RouteDeps } from "../routes/types.js";
import { loginAsOwner, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file T0-1 of the AG-UI design (S0): the exact bytes the admin AG-UI route answers for a scripted
 * daemon stream, plus its HTTP/1.1 response headers.
 *
 * The scripts cover every `RunAgentPayload` type with every optional field populated (`media`,
 * `outcome`, `isError`, `bridgeCall`, `toolOrigin`, a status `detail`, `surfaceExchange`) and the
 * frame-level cases: a `stdout` chunk holding an echo line and a heartbeat line, a `stderr` chunk,
 * an unknown frame kind, an id-only keepalive, an `error` frame, `end` with `max_tool_turns`, `end`
 * with a failed status, `end` with a cancelled status, and a stream that closes with no `end`.
 *
 * Any change to an event, its order, an id, a header or the frame text fails here. Regenerate with
 * `UPDATE_GOLDEN=1` only in a commit that names the wire change it makes.
 */

const TOKEN = "f".repeat(64);
const GOLDEN = fileURLToPath(new URL("./goldens/assistant-ag-ui-wire.golden.json", import.meta.url));
const RUN_PATH = "/api/admin/v1/assistant/ag-ui-run";

function wireFrame(kind: string, payload: unknown, cursor: number): string {
  const data = JSON.stringify({ runId: "daemon-run-1", eventId: `e${cursor}`, opaqueCursor: String(cursor), protocolVersion: 1, ts: 0, kind, payload, durability: "durable" });
  return `id: ${cursor}\nevent: ${kind}\ndata: ${data}\n\n`;
}

const MCP_UI_RESOURCE = { type: "resource", resource: { uri: "ui://confirm/1", mimeType: "text/html", text: "<p>Delete?</p>", _meta: { existing: true } } };

const STDOUT_CHUNK = [
  '{"type":"assistant","message":{"content":[{"type":"text","text":"echo of the answer"}]}}',
  '{"type":"system","subtype":"api_retry","attempt":2,"max_retries":5,"error_status":529,"error":"overloaded"}',
  "plain stdout line",
  "",
].join("\n");

/** Every payload type, then the frame kinds a run can carry before its terminal frame. */
const EVERY_PAYLOAD: readonly (readonly [string, unknown])[] = [
  ["agent", { type: "status", label: "Working", detail: "step 2 of 3" }],
  ["agent", { type: "status", label: "Still working" }],
  ["agent", { type: "thinking_start" }],
  ["agent", { type: "thinking_delta", delta: "plan the search" }],
  ["agent", { type: "text_delta", delta: "Let me check that." }],
  ["agent", { type: "tool_input_delta", id: "call-1", delta: '{"q":' }],
  ["agent", { type: "tool_use", id: "call-1", name: "search", input: { q: "posts" }, toolOrigin: "bridge", bridgeCall: { name: "posts.search", input: { q: "posts" }, buffered: true } }],
  ["agent", { type: "tool_result", toolUseId: "call-1", content: "found 3", isError: true, media: [{ type: "image", mimeType: "image/png", data: "AAAA" }], outcome: "unknown" }],
  ["agent", { type: "usage", usage: { input_tokens: 11, output_tokens: 7 }, costUsd: 0.01, cumulativeCostUsd: 0.05, costSessionId: "cost-1", durationMs: 1200, stopReason: "end_turn" }],
  ["agent", { type: "raw", line: "raw line" }],
  ["agent", { type: "mcp-ui", resource: MCP_UI_RESOURCE, surfaceExchange: { exchangeId: "ex-1", toolId: "posts.delete", runId: "daemon-run-1" }, pendingApproval: { id: "approval-1", reason: "confirmation", toolCallId: "call-1", message: "Allow action?" } }],
  ["agent", { type: "a2ui", message: { createSurface: { surfaceId: "s1", catalogId: "basic" } } }],
  ["agent", { type: "stage_start", stage: "plan" }],
  ["stdout", { chunk: STDOUT_CHUNK }],
  ["stderr", { chunk: "warn: slow upstream\n" }],
  ["heartbeat", {}],
  ["agent", { type: "text_delta", delta: "Found 3 posts." }],
];

interface Script {
  readonly frames: readonly (readonly [string, unknown])[];
  readonly dropConnection?: true;
  /** Raw text written between the frames and the close, for cases a frame tuple cannot express. */
  readonly keepalive?: boolean;
}

const SCRIPTS: Readonly<Record<string, Script>> = {
  "every payload, then end with max_tool_turns": { frames: [...EVERY_PAYLOAD, ["end", { reason: "max_tool_turns", status: "succeeded" }]], keepalive: true },
  "an error frame": { frames: [["agent", { type: "text_delta", delta: "partial" }], ["error", { message: "agent crashed: exit 1" }]] },
  "end with a failed status": { frames: [["agent", { type: "text_delta", delta: "partial" }], ["end", { reason: "error", status: "failed", code: 1, signal: null, resumable: false }]] },
  "end with a cancelled status": { frames: [["agent", { type: "thinking_delta", delta: "thinking" }], ["end", { reason: "canceled", status: "canceled", code: null, signal: "SIGTERM", resumable: true }]] },
  "a stream that closes with no end frame": { frames: [["agent", { type: "text_delta", delta: "partial" }]] },
};

let activeScript: Script = SCRIPTS["an error frame"]!;

function writeScript(res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/event-stream" });
  if (activeScript.dropConnection) {
    res.write(wireFrame("agent", { type: "text_delta", delta: "partial" }, 1), () => res.destroy());
    return;
  }
  if (activeScript.keepalive) res.write("id: 0\n\n");
  activeScript.frames.forEach(([kind, payload], index) => res.write(wireFrame(kind, payload, index + 1)));
  res.end();
}

async function startStandInDaemon(): Promise<{ origin: string; server: Server }> {
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/api/runs") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ run: { id: "daemon-run-1" } }));
        return;
      }
      if ((req.url ?? "").includes("/runs/daemon-run-1/events")) return writeScript(res);
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found in stand-in daemon" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

let harnessPromise: Promise<{ buildApp: () => express.Express; daemon: Server }> | null = null;
function harness() {
  harnessPromise ??= (async () => {
    const { origin, server } = await startStandInDaemon();
    process.env.JINI_AGENT_DAEMON_URL = origin;
    process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = TOKEN;
    const { createRouteDeps } = await import("../runtime/composition/app.js");
    const { createAssistantAgUiModule } = await import("../runtime/composition/modules/assistant-ag-ui.js");
    const { registerAuthRoutes } = await import("../inbound/admin-http/dev-auth.js");
    return {
      daemon: server,
      buildApp: () => {
        const deps: RouteDeps = createRouteDeps();
        const app = express();
        app.use(express.json());
        registerAuthRoutes({ app, deps });
        createAssistantAgUiModule(deps).registerRoutes?.({ app });
        return app;
      },
    };
  })();
  return harnessPromise;
}

test.after(async () => {
  const built = await harnessPromise;
  if (built) await new Promise<void>((resolve) => built.daemon.close(() => resolve()));
});

interface Captured {
  httpVersion: string;
  status: number;
  headers: [string, string][];
  body: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A raw `node:http` request: `fetch` hides hop-by-hop headers such as `connection`. */
function postRun(baseUrl: string, cookie: string): Promise<Captured> {
  const body = JSON.stringify({ threadId: "thread-golden", runId: "run-golden", messages: [{ role: "user", content: "find my posts" }] });
  return new Promise((resolve, reject) => {
    const req = request(`${baseUrl}${RUN_PATH}`, { method: "POST", agent: false, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), cookie } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const headers: [string, string][] = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) headers.push([res.rawHeaders[i]!.toLowerCase(), res.rawHeaders[i + 1]!]);
        resolve({ httpVersion: res.httpVersion, status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** The request id is minted per request and the date is the wall clock: both are checked for shape
 *  here and replaced, so every other header byte stays pinned. */
function pinHeaders(headers: [string, string][]): [string, string][] {
  return headers.map(([name, value]): [string, string] => {
    if (name === "x-tovu-request-id") {
      assert.match(value, UUID);
      return [name, "<uuid>"];
    }
    if (name === "date") {
      assert.ok(!Number.isNaN(Date.parse(value)));
      return [name, "<date>"];
    }
    return [name, value];
  }).sort(([a], [b]) => a.localeCompare(b));
}

async function boot(t: import("node:test").TestContext) {
  const { buildApp } = await harness();
  resetAssistantDaemonSingletonForTests();
  startAssistantDaemon({ workspaceId: "test", siteDir: "/fake-site" }, {
    registerProcessSignalHandlers: false, refreshPort: async () => {},
    spawnDaemonProcess: () => Object.assign(new EventEmitter(), { pid: 321, kill: () => true }),
    readDiscovery: async () => ({ pid: 321, url: "http://127.0.0.1:0" }),
  });
  t.after(resetAssistantDaemonSingletonForTests);
  const baseUrl = await startTestServer(buildApp(), t);
  return { baseUrl, cookie: await loginAsOwner(baseUrl) };
}

test("a dropped daemon stream closes partial text and reports a private interruption message", async t => {
  const { baseUrl, cookie } = await boot(t);
  activeScript = { frames: [], dropConnection: true };
  const captured = await postRun(baseUrl, cookie);
  assert.equal(captured.status, 200, "the read failure follows successful SSE headers");
  const events = captured.body.split("\n\n").filter(frame => frame.startsWith("data: ")).map(frame => JSON.parse(frame.slice(6)));
  assert.deepEqual(events.map(event => event.type), ["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_ERROR"], "partial text closes before the single run error");
  assert.equal(events[2].delta, "partial", "the partial upstream text reaches the response");
  assert.equal(events[4].message, "The assistant’s response was interrupted. Send your request again.", "the run error contains only the approved interruption message");
});

test("Jini's shipped AG-UI reader completes Tovu's authenticated stream with its IDs and text intact", async (t) => {
  const { baseUrl, cookie } = await boot(t);
  activeScript = { frames: [["agent", { type: "text_delta", delta: "Packed reader contract" }], ["end", { reason: "stop", status: "succeeded" }]] };
  const agent = createAgUiFetchAgent({ request: async ({ input, signal }) => {
    const response = await fetch(`${baseUrl}${RUN_PATH}`, {
      method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(input), signal,
    });
    assert.equal(response.status, 200, "the authenticated AG-UI request succeeds");
    assert.match(response.headers.get("content-type")!, /^text\/event-stream\b/, "the real route serves an event stream to the shipped reader");
    return response;
  } });
  const events: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    agent.run({
      threadId: "thread-packed-reader", runId: "run-packed-reader",
      messages: [{ id: "user-packed-reader", role: "user", content: "Read this turn" }],
      tools: [], context: [], state: {}, forwardedProps: {},
    }).subscribe({ next: event => events.push(event), error: reject, complete: resolve });
  });
  assert.deepEqual(events, [
    { type: "RUN_STARTED", threadId: "thread-packed-reader", runId: "run-packed-reader" },
    { type: "TEXT_MESSAGE_START", messageId: "msg_1", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "msg_1", delta: "Packed reader contract" },
    { type: "TEXT_MESSAGE_END", messageId: "msg_1" },
    { type: "RUN_FINISHED", threadId: "thread-packed-reader", runId: "run-packed-reader", result: { reason: "stop" } },
  ], "the shipped reader completes with the requested IDs and the text delta before run finish");
});

test("the AG-UI route refuses a valid request without a session cookie", async (t) => {
  const { baseUrl } = await boot(t);
  const response = await fetch(`${baseUrl}${RUN_PATH}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId: "thread-no-session", runId: "run-no-session", messages: [{ id: "user-no-session", role: "user", content: "Read this turn" }], tools: [], context: [], state: {}, forwardedProps: {} }),
  });
  assert.equal(response.status, 401, "a valid AG-UI request requires an authenticated session");
});

test("the AG-UI route refuses authenticated requests whose messages are not an array", async (t) => {
  const { baseUrl, cookie } = await boot(t);
  const response = await fetch(`${baseUrl}${RUN_PATH}`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ threadId: "thread-malformed", runId: "run-malformed", messages: "not an array" }),
  });
  assert.equal(response.status, 400, "the authenticated AG-UI route rejects a malformed messages field");
});

const actual: Record<string, Captured> = {};

for (const [name, script] of Object.entries(SCRIPTS)) {
  test(`AG-UI wire golden: ${name}`, async (t) => {
    const { baseUrl, cookie } = await boot(t);
    activeScript = script;
    const captured = await postRun(baseUrl, cookie);
    actual[name] = { ...captured, headers: pinHeaders(captured.headers) };
    if (process.env.UPDATE_GOLDEN === "1") return;
    const golden = (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Captured>)[name];
    assert.ok(golden, `no golden for "${name}"`);
    assert.equal(actual[name]!.body, golden.body);
    assert.deepEqual({ ...actual[name], body: "" }, { ...golden, body: "" });
  });
}

test("the golden file holds exactly these scenarios", () => {
  if (process.env.UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Captured>;
  assert.deepEqual(Object.keys(golden), Object.keys(SCRIPTS));
});
