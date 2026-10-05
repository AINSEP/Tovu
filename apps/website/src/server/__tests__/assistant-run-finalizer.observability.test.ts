import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";

import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ChatMessage } from "@jini-ai/chat/core";

import { createAssistantRunFinalizer, createHttpRunDaemonClient, type RunDaemonClient } from "../runtime/composition/modules/assistant-run-finalizer.js";
import { createNoopObservabilityPort, type AgentRunStatus, type ObservabilityPort } from "#src/platform/observability/index";
import { assertSpanOmits, createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { AGENT_DAEMON_TOKEN_ENV_VAR, type ChatRunLedger } from "../../assistant/index.js";

/**
 * @file The finalizer is the API-side seam that sees every daemon run's terminal outcome, so it is
 * where `trackAgentRun` is recorded: one tracked run per watched run, ended with the outcome the
 * finalizer itself proved (succeeded/failed/canceled from the `end` frame, interrupted on a 404,
 * abandoned on reconnect exhaustion), and the follow loop runs inside the run's scope so its
 * ledger writes nest under the run span.
 */

interface Recorded {
  runId: string;
  conversationId: string | undefined;
  outcome?: { status: AgentRunStatus; error?: unknown };
  ranInside: boolean;
}

function recordingPort(): { port: ObservabilityPort; runs: Recorded[]; inside: () => boolean } {
  const runs: Recorded[] = [];
  // Async scope, like the real adapter's: the follow loop awaits, so a sync flag would read false.
  const scope = new AsyncLocalStorage<true>();
  const port: ObservabilityPort = {
    ...createNoopObservabilityPort({}),
    trackAgentRun({ runId }, { conversationId } = {}) {
      const record: Recorded = { runId, conversationId, ranInside: false };
      runs.push(record);
      return {
        run<T>(fn: () => T): T {
          record.ranInside = true;
          return scope.run(true, fn);
        },
        end(outcome) {
          record.outcome = outcome;
        },
      };
    },
  };
  return { port, runs, inside: () => scope.getStore() === true };
}

/** The finalizer writes through `settle`/`checkpoint` only; the fake records the settled status. */
function fakeLedger(options: { failSettle?: boolean } = {}): ChatRunLedger & { settled: string[] } {
  const settled: string[] = [];
  const ledger = {
    settled,
    async settle(input: { status: string }) {
      if (options.failSettle) throw new Error("SQLITE_FULL: database or disk is full");
      settled.push(input.status);
    },
    async checkpoint() {},
  };
  return ledger as unknown as ChatRunLedger & { settled: string[] };
}

const frame = (kind: string, payload: unknown) => `event: ${kind}\ndata: ${JSON.stringify({ runId: "run-1", kind, payload })}\n\n`;
const stream = (...chunks: string[]) => new Response(chunks.join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const daemon = (events: () => Response, runStatus: number | null = 200): RunDaemonClient => ({ openEvents: async () => events(), runStatus: async () => runStatus });
const stub: ChatMessage = { id: "a1", role: "assistant", content: "", runId: "run-1", runStatus: "running" } as ChatMessage;

async function watchOnce(input: { daemon: RunDaemonClient; ledger?: ChatRunLedger & { settled: string[] } }) {
  const { port, runs } = recordingPort();
  const ledger = input.ledger ?? fakeLedger();
  const finalizer = createAssistantRunFinalizer({ ledger, daemon: input.daemon, observability: port, reconnectDelayMs: 1, maxReconnects: 1, checkpointIntervalMs: 0 });
  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  await finalizer.idle();
  return { runs, ledger };
}

for (const status of ["succeeded", "failed", "canceled"] as const) {
  test(`an end frame with status ${status} ends the tracked run ${status}, with run and conversation ids`, async () => {
    const { runs, ledger } = await watchOnce({ daemon: daemon(() => stream(frame("start", { agentId: "claude" }), frame("end", { code: 0, status }))) });
    assert.deepEqual(ledger.settled, [status]);
    assert.deepEqual(runs, [{ runId: "run-1", conversationId: "conv-1", ranInside: true, outcome: { status } }]);
  });
}

test("a run the daemon no longer knows (404) is tracked as interrupted", async () => {
  const { runs } = await watchOnce({ daemon: daemon(() => new Response("", { status: 404 })) });
  assert.deepEqual(runs.map((run) => run.outcome), [{ status: "interrupted" }]);
});

test("reconnect exhaustion is tracked as abandoned, not as a failure", async () => {
  const { runs, ledger } = await watchOnce({ daemon: daemon(() => stream(frame("agent", { type: "text_delta", delta: "Part" }))) });
  assert.deepEqual(ledger.settled, []);
  assert.deepEqual(runs.map((run) => run.outcome), [{ status: "abandoned" }]);
});

test("a failed terminal write ends the tracked run abandoned with the error, so the span shows why", async () => {
  const { runs } = await watchOnce({ daemon: daemon(() => stream(frame("end", { code: 0, status: "succeeded" }))), ledger: fakeLedger({ failSettle: true }) });
  assert.equal(runs[0]?.outcome?.status, "abandoned");
  assert.match(String((runs[0]?.outcome?.error as Error).message), /SQLITE_FULL/);
});

test("the follow loop, including its ledger write, runs inside the tracked run's scope", async () => {
  const { port, inside } = recordingPort();
  const seen: boolean[] = [];
  const ledger = fakeLedger();
  const original = ledger.settle.bind(ledger);
  ledger.settle = async (input) => {
    seen.push(inside());
    return original(input);
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon: daemon(() => stream(frame("end", { code: 0, status: "succeeded" }))), observability: port, checkpointIntervalMs: 0 });
  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  await finalizer.idle();
  assert.deepEqual(seen, [true]);
});

// --- The default daemon client's loopback requests: one outbound CLIENT span each through the
// finalizer's port — method, host/port and status, never the run id, principal or token.

const DAEMON_TOKEN = "tok-finalizer-6a0";

/** A real stand-in daemon on loopback plus the env the client resolves it from, both undone after the test. */
async function standInDaemon(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const daemonPort = (server.address() as AddressInfo).port;
  withDaemonEnv(t, `http://127.0.0.1:${daemonPort}`);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return daemonPort;
}

function withDaemonEnv(t: TestContext, url: string): void {
  const previous = { url: process.env.JINI_AGENT_DAEMON_URL, token: process.env[AGENT_DAEMON_TOKEN_ENV_VAR] };
  process.env.JINI_AGENT_DAEMON_URL = url;
  process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = DAEMON_TOKEN;
  t.after(() => {
    if (previous.url === undefined) delete process.env.JINI_AGENT_DAEMON_URL;
    else process.env.JINI_AGENT_DAEMON_URL = previous.url;
    if (previous.token === undefined) delete process.env[AGENT_DAEMON_TOKEN_ENV_VAR];
    else process.env[AGENT_DAEMON_TOKEN_ENV_VAR] = previous.token;
  });
}

test("createHttpRunDaemonClient: runStatus and openEvents are each one CLIENT span, never the run id, principal or token", async (t) => {
  const daemonPort = await standInDaemon(t, (req, res) => {
    if (req.url?.endsWith("/events")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": open\n\n"); // stays open: the span must end at the headers, not with the stream
      return;
    }
    res.statusCode = req.url?.includes("gone") ? 404 : 200;
    res.end("{}");
  });
  const { exporter, port } = createInMemoryOtel();
  const client = createHttpRunDaemonClient({ observability: port });

  assert.equal(await client.runStatus("run-secret-77", "principal-secret-3"), 200);
  const events = await client.openEvents("run-secret-77", "principal-secret-3");
  assert.equal(events.status, 200);
  assert.equal(await client.runStatus("run-gone", "principal-secret-3"), 404);

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 3, "the events span ended at its headers, with the stream still open");
  await events.body?.cancel();
  for (const span of spans) {
    assert.equal(span.name, "GET 127.0.0.1");
    assert.equal(span.kind, SpanKind.CLIENT);
    assert.equal(span.attributes["server.port"], daemonPort);
    assertSpanOmits(span, ["run-secret-77", "run-gone", "principal-secret-3", DAEMON_TOKEN, "/api"]);
  }
  assert.deepEqual(spans.map((span) => span.attributes["http.response.status_code"]), [200, 200, 404]);
  assert.equal(spans[2].status.code, SpanStatusCode.ERROR);
});

test("createHttpRunDaemonClient: an unreachable daemon is a null status and an ERROR span with the error type", async (t) => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const closedPort = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  withDaemonEnv(t, `http://127.0.0.1:${closedPort}`);
  const { exporter, port } = createInMemoryOtel();

  assert.equal(await createHttpRunDaemonClient({ observability: port }).runStatus("run-secret-77", "p1"), null);

  const [span] = exporter.getFinishedSpans();
  assert.equal(span.status.code, SpanStatusCode.ERROR);
  assert.equal(typeof span.attributes["error.type"], "string");
  assertSpanOmits(span, ["run-secret-77", DAEMON_TOKEN]);
});

test("createAssistantRunFinalizer without a daemon traces its default client's loopback requests with its own port", async (t) => {
  await standInDaemon(t, (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(frame("end", { code: 0, status: "succeeded" }));
  });
  const { exporter, port } = createInMemoryOtel();
  const ledger = fakeLedger();
  const finalizer = createAssistantRunFinalizer({ ledger, observability: port, checkpointIntervalMs: 0 });

  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  await finalizer.idle();

  assert.deepEqual(ledger.settled, ["succeeded"]);
  const clientSpans = exporter.getFinishedSpans().filter((span) => span.kind === SpanKind.CLIENT);
  assert.equal(clientSpans.length, 1);
  assert.equal(clientSpans[0].name, "GET 127.0.0.1");
  assertSpanOmits(clientSpans[0], ["run-1", DAEMON_TOKEN]);
});
