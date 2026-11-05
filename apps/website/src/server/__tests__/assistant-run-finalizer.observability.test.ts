import { createTracker } from "@jini-ai/diagnostics/observability/node";
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
 * finalizer resolved (succeeded/failed/canceled from the `end` frame, interrupted on a 404,
 * interrupted on bounded uncertainty), and the follow loop runs inside the run's scope so its
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
  const finalizer = createAssistantRunFinalizer({ ledger, daemon: input.daemon, tracker: createTracker({ observability: port }), observability: port, reconnectDelayMs: 1, maxReconnects: 1, checkpointIntervalMs: 0 });
  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  await finalizer.idle();
  return { runs, ledger };
}

/** Inject both deadline and trailing timers, retaining every handle until canceled or fired. */
function injectedTimers(t: TestContext) {
  const live = new Map<object, { run: () => void; delayMs: number }>();
  t.mock.method(globalThis, "setTimeout", ((run: () => void, delayMs = 0) => {
    const handle = { unref() { return handle; } };
    live.set(handle, { run, delayMs });
    return handle;
  }) as typeof setTimeout);
  t.mock.method(globalThis, "clearTimeout", ((handle: object) => { live.delete(handle); }) as typeof clearTimeout);
  return {
    live,
    scheduler: { schedule({ run, delayMs }: { run: () => void; delayMs: number }) {
      const handle = setTimeout(run, delayMs);
      return () => clearTimeout(handle);
    } },
    fire(delayMs: number) {
      const due = [...live].filter(([, timer]) => timer.delayMs === delayMs);
      assert.equal(due.length, 1, "exactly one trailing timer must be armed");
      for (const [handle, timer] of due) { live.delete(handle); timer.run(); }
    },
  };
}

const drainFrames = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Drive the real stream/watch lifecycle with a fixed clock and no native timer handles. */
function timerWatch(t: TestContext, checkpoint: ChatRunLedger["checkpoint"], interval = 1_000) {
  const timers = injectedTimers(t);
  const clock = { now: 1_000 };
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const settled: string[] = [];
  const finalizer = createAssistantRunFinalizer({
    ledger: { checkpoint, settle: async ({ status }) => { settled.push(status); return true; } } as ChatRunLedger,
    daemon: daemon(() => new Response(body), null),
    now: () => clock.now, scheduler: timers.scheduler, checkpointIntervalMs: interval, maxReconnects: 0,
  });
  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  return { timers, clock, finalizer, settled, close: () => controller.close(),
    push: (kind: string, payload: unknown) => controller.enqueue(new TextEncoder().encode(frame(kind, payload))),
  };
}

for (const result of [false, undefined, "reject"] as const) {
  test(`checkpoint completion does not retry the same snapshot after ${result}`, async (t) => {
    t.mock.method(console, "error", () => undefined);
    let writes = 0;
    let release!: (written: boolean) => void;
    const held = new Promise<boolean>((resolve) => { release = resolve; });
    const run = timerWatch(t, (async () => {
      if (++writes > 1) return held; // Bound the old microtask loop so the regression fails promptly.
      if (result === "reject") throw new Error("storage unavailable");
      return result;
    }) as ChatRunLedger["checkpoint"], 0);
    try {
      run.push("agent", { type: "text_delta", delta: "Part" });
      await drainFrames();
      assert.equal(writes, 1, "a completion needs newer progress before it can schedule another write");
    } finally {
      run.push("end", { status: "succeeded", code: 0 });
      await run.finalizer.idle();
      release(false);
      await drainFrames();
      assert.equal(run.timers.live.size, 0, "settlement leaves no deadline or trailing timer");
    }
  });
}

for (const interval of [0, 2_500]) {
  test(`a quiet failed checkpoint retries with backoff at interval ${interval} until its growth is saved`, async (t) => {
    t.mock.method(console, "error", () => undefined);
    const saved: string[] = [];
    const run = timerWatch(t, async ({ content }) => {
      saved.push(content);
      if (saved.length < 3) throw new Error("SQLITE_BUSY");
      return true;
    }, interval);
    const backoff = Math.max(interval, 1_000);
    try {
      run.push("agent", { type: "text_delta", delta: "Part" });
      await drainFrames();
      assert.deepEqual(saved, ["Part"]);
      assert.equal([...run.timers.live.values()].filter(timer => timer.delayMs === backoff).length, 1);
      run.clock.now += backoff - 1;
      run.push("agent", { type: "text_delta", delta: " tail" });
      await drainFrames();
      assert.equal(saved.length, 1, "new frames cannot bypass failure backoff");
      run.clock.now++;
      run.timers.fire(backoff);
      await drainFrames();
      assert.deepEqual(saved, ["Part", "Part tail"]);
      assert.equal([...run.timers.live.values()].filter(timer => timer.delayMs === backoff).length, 1);
      run.clock.now += backoff;
      run.timers.fire(backoff);
      await drainFrames();
      assert.deepEqual(saved, ["Part", "Part tail", "Part tail"]);
      assert.equal([...run.timers.live.values()].filter(timer => timer.delayMs === backoff).length, 0,
        "successful persistence exhausts unsaved growth, so quiet runs stop retrying");
    } finally {
      run.push("end", { status: "succeeded", code: 0 });
      await run.finalizer.idle();
      assert.equal(run.timers.live.size, 0);
    }
  });
}

for (const status of ["succeeded", "failed", "canceled"] as const) {
  test(`a ${status} run clears a failed-checkpoint retry and ignores its queued callback`, async (t) => {
    t.mock.method(console, "error", () => undefined);
    let writes = 0;
    const run = timerWatch(t, async () => { writes++; throw new Error("SQLITE_BUSY"); }, 0);
    run.push("agent", { type: "text_delta", delta: "Part" });
    await drainFrames();
    const retry = [...run.timers.live.values()].filter(timer => timer.delayMs === 1_000);
    assert.equal(retry.length, 1);
    run.push("end", { status, code: 0 });
    await run.finalizer.idle();
    assert.deepEqual(run.settled, [status]);
    assert.equal(run.timers.live.size, 0);
    retry[0]!.run();
    await drainFrames();
    assert.equal(writes, 1);
    assert.equal(run.timers.live.size, 0);
  });
}

for (const status of ["succeeded", "failed", "canceled"] as const) {
  test(`a ${status} run clears every injected timer and ignores a queued timer callback`, async (t) => {
    const run = timerWatch(t, async () => true);
    run.push("agent", { type: "text_delta", delta: "Part" });
    await drainFrames();
    run.push("agent", { type: "text_delta", delta: " tail" });
    await drainFrames();
    const trailing = [...run.timers.live.values()].filter((timer) => timer.delayMs === 1_000);
    assert.equal(trailing.length, 1, "the quiet run had unsaved growth and a live trailing timer");
    run.push("end", { status, code: 0 });
    await run.finalizer.idle();
    assert.deepEqual(run.settled, [status]);
    assert.equal(run.timers.live.size, 0, "settlement must clear all live timers");
    trailing[0]!.run();
    await drainFrames();
    assert.equal(run.timers.live.size, 0, "an already queued callback cannot resurrect a settled watch");
  });
}

test("an abandoned watch cannot rearm a timer when its pending checkpoint completes late", async (t) => {
  t.mock.method(console, "error", () => undefined);
  let release!: (written: boolean) => void;
  const held = new Promise<boolean>((resolve) => { release = resolve; });
  let writes = 0;
  const run = timerWatch(t, async () => {
    if (++writes === 1) return held;
    throw new Error("the final recovery checkpoint failed");
  });
  run.push("agent", { type: "text_delta", delta: "Part" });
  await drainFrames();
  run.push("agent", { type: "text_delta", delta: " tail" });
  await drainFrames();
  assert.equal(writes, 1, "a progress write is still pending");
  run.close();
  await run.finalizer.idle();
  assert.equal(run.finalizer.activeCount(), 0);
  assert.equal(run.timers.live.size, 0);
  release(false);
  await drainFrames();
  assert.equal(run.timers.live.size, 0, "a late failed write must not create a timer after watch cleanup");
  assert.equal(writes, 2);
});

test("recovery clears its trailing timer before awaiting the final checkpoint", async (t) => {
  let release!: (written: boolean) => void;
  const held = new Promise<boolean>((resolve) => { release = resolve; });
  let writes = 0;
  const run = timerWatch(t, async () => ++writes === 1 ? true : held);
  try {
    run.push("agent", { type: "text_delta", delta: "Part" });
    await drainFrames();
    run.push("agent", { type: "text_delta", delta: " tail" });
    await drainFrames();
    assert.equal([...run.timers.live.values()].filter((timer) => timer.delayMs === 1_000).length, 1);
    run.close();
    await drainFrames();
    assert.equal(writes, 2, "recovery is awaiting its final storage write");
    assert.equal(run.timers.live.size, 0, "storage latency cannot keep a stopped watch's timer live");
  } finally {
    release(false);
    await run.finalizer.idle();
  }
  assert.equal(run.timers.live.size, 0);
});

test("a quiet run's trailing checkpoint fires once and never rearms unchanged content", async (t) => {
  const saved: string[] = [];
  const run = timerWatch(t, async ({ content }) => { saved.push(content); return true; });
  run.push("agent", { type: "text_delta", delta: "Part" });
  await drainFrames();
  run.push("agent", { type: "text_delta", delta: " tail" });
  await drainFrames();
  run.clock.now += 1_000;
  run.timers.fire(1_000);
  await drainFrames();
  assert.deepEqual(saved, ["Part", "Part tail"]);
  assert.equal([...run.timers.live.values()].filter((timer) => timer.delayMs === 1_000).length, 0);
  run.push("end", { status: "succeeded", code: 0 });
  await run.finalizer.idle();
  assert.equal(run.timers.live.size, 0);
});

for (const status of ["succeeded", "failed", "canceled"] as const) {
  test(`an end frame with status ${status} ends the tracked run ${status}, with run and conversation ids`, async () => {
    const { runs, ledger } = await watchOnce({ daemon: daemon(() => stream(frame("start", { agentId: "claude" }), frame("end", { code: 0, status }))) });
    assert.deepEqual(ledger.settled, [status]);
    assert.deepEqual(runs, [{ runId: "run-1", conversationId: "conv-1", ranInside: true, outcome: { status } }]);
  });
}

test("a run the daemon no longer knows (404) is tracked as interrupted", async () => {
  const { runs } = await watchOnce({ daemon: daemon(() => new Response("", { status: 404 }), 404) });
  assert.deepEqual(runs.map((run) => run.outcome), [{ status: "interrupted" }]);
});

test("inconclusive reconnect exhaustion cannot terminalize a row without the recovery port", async () => {
  const { runs, ledger } = await watchOnce({ daemon: daemon(() => stream(frame("agent", { type: "text_delta", delta: "Part" })), null) });
  assert.deepEqual(ledger.settled, []);
  assert.deepEqual(runs.map((run) => run.outcome), [{ status: "interrupted" }]);
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
  const finalizer = createAssistantRunFinalizer({ ledger, daemon: daemon(() => stream(frame("end", { code: 0, status: "succeeded" }))), tracker: createTracker({ observability: port }), observability: port, checkpointIntervalMs: 0 });
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

  assert.equal(await client.runStatus({ runId: "run-secret-77", principalId: "principal-secret-3" }, {}), 200);
  const events = await client.openEvents({ runId: "run-secret-77", principalId: "principal-secret-3" }, {});
  assert.equal(events.status, 200);
  assert.equal(await client.runStatus({ runId: "run-gone", principalId: "principal-secret-3" }, {}), 404);

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

  assert.equal(await createHttpRunDaemonClient({ observability: port }).runStatus({ runId: "run-secret-77", principalId: "p1" }, {}), null);

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
  const finalizer = createAssistantRunFinalizer({ ledger, tracker: createTracker({ observability: port }), observability: port, checkpointIntervalMs: 0 });

  finalizer.watch({ principalId: "p1", conversationId: "conv-1", message: stub });
  await finalizer.idle();

  assert.deepEqual(ledger.settled, ["succeeded"]);
  const clientSpans = exporter.getFinishedSpans().filter((span) => span.kind === SpanKind.CLIENT);
  assert.equal(clientSpans.length, 1);
  assert.equal(clientSpans[0].name, "GET 127.0.0.1");
  assertSpanOmits(clientSpans[0], ["run-1", DAEMON_TOKEN]);
});
