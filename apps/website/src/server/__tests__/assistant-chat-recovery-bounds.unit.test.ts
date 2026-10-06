import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { EXHAUSTED_NOTICE } from "#src/assistant/durable-runs/recover";
import { recoveryLedgerFixture } from "./durable-ledger.fixture.js";
import { createAssistantRunFinalizer, createHttpRunDaemonClient, type RunDaemonClient } from "../runtime/composition/modules/assistant-run-finalizer.js";

/** Uncertainty has a five-minute recovery budget; fresh live proof renews a watch. The previous
 * daemon may survive teardown or its PID may be reused, so HTTP ownership and process identity
 * stay separate evidence. All clocks, storage and daemon calls are injected ports. */
async function flush() { for (let i = 0; i < 64; i++) await Promise.resolve(); }

function recoveryHarness({ daemon, statusTimeoutMs = 10 }: { daemon: RunDaemonClient; statusTimeoutMs?: number }, _optional = {}) {
  let time = 1000;
  const timers = new Set<{ at: number; run: () => void }>();
  const scheduler: SupervisorScheduler = { schedule({ delayMs, run }) {
    const timer = { at: time + delayMs, run }; timers.add(timer); return () => { timers.delete(timer); };
  } };
  const message: ChatMessage = { id: "answer", role: "assistant", content: "Partial answer", events: [{ kind: "text", text: "Partial answer" }], runId: "old", runStatus: "running" };
  const { ledger } = recoveryLedgerFixture({ message, now: () => time }, {});
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, now: () => time, scheduler,
    resolutionTimeoutMs: 300_000, statusTimeoutMs, reconnectDelayMs: 0, checkpointIntervalMs: 0,
  }, {});
  async function elapse({ ms }: { ms: number }, _options = {}) {
    await flush(); const end = time + ms;
    for (;;) {
      const timer = [...timers].filter((entry) => entry.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!timer) break;
      time = timer.at; timers.delete(timer); timer.run(); await flush();
    }
    time = end; await flush();
  }
  return { finalizer, message, timers, elapse };
}

test("a quiet stream without live proof waits five minutes, finalizes once and keeps its saved text", async () => {
  let launches = 0;
  const h = recoveryHarness({ daemon: { runStatus: async () => null, openEvents: async () => new Response(new ReadableStream()),
    launch: async () => { launches++; },
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 1);
  await h.elapse({ ms: 299_999 }, {}); assert.equal(h.message.runStatus, "running");
  await h.elapse({ ms: 1 }, {}); await h.finalizer.idle();
  assert.equal(h.message.runStatus, "failed"); assert.equal(h.message.content, "Partial answer");
  assert.deepEqual(h.message.events, [{ kind: "text", text: "Partial answer" }, { kind: "status", label: EXHAUSTED_NOTICE }]);
  assert.equal(h.message.endedAt, 301_000); assert.equal(launches, 0); assert.equal(h.finalizer.activeCount(), 0); assert.equal(h.timers.size, 0);
});

test("a stalled boot status probe is bounded before adopting an uncertain attempt", async () => {
  let launches = 0;
  const h = recoveryHarness({ daemon: { runStatus: async () => new Promise(() => {}), openEvents: async () => new Promise(() => {}), launch: async () => { launches++; } } }, {});
  const boot = h.finalizer.reconcileInterrupted({}, {});
  await h.elapse({ ms: 10 }, {}); assert.equal(await boot, 1);
  assert.equal(h.message.runStatus, "running"); assert.equal(h.finalizer.activeCount(), 1);
  await h.elapse({ ms: 300_020 }, {}); await h.finalizer.idle();
  assert.equal(h.message.runStatus, "failed"); assert.equal(h.message.content, "Partial answer"); assert.equal(launches, 0);
});

test("fresh proof keeps a live quiet attempt watched beyond the recovery window until it completes", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const h = recoveryHarness({ daemon: { runStatus: async () => 200, openEvents: async () => new Response(body) } }, {});
  await h.finalizer.reconcileInterrupted({}, {}); await h.elapse({ ms: 600_000 }, {});
  assert.equal(h.message.runStatus, "running"); assert.equal(h.finalizer.activeCount(), 1);
  controller.enqueue(new TextEncoder().encode('event: end\ndata: {"payload":{"status":"succeeded","code":0}}\n\n')); controller.close();
  await h.finalizer.idle();
  assert.equal(h.message.runStatus, "succeeded"); assert.equal(h.message.content, "Partial answer"); assert.equal(h.finalizer.activeCount(), 0);
});

test("a surviving prior daemon's 404 falls back to the current accepted attempt before declaring death", async () => {
  const urls: string[] = [];
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4101", pid: 77 }), isAlive: () => true,
    currentUrl: () => "http://127.0.0.1:4102",
    fetch: async (url) => { urls.push(String(url)); return new Response(null, { status: String(url).includes(":4101/") ? 404 : 200 }); },
  });
  const run = { runId: "accepted", principalId: "owner" };
  assert.equal(await client.runStatus(run, {}), 200); await client.openEvents(run, {});
  assert.deepEqual(urls, ["http://127.0.0.1:4101/api/runs/accepted", "http://127.0.0.1:4102/api/runs/accepted", "http://127.0.0.1:4102/api/runs/accepted/events"]);
});

test("fallback replay addresses are scoped to each recovered run and owner", async () => {
  const urls: string[] = [];
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4101", pid: 77 }),
    isAlive: () => true,
    currentUrl: () => "http://127.0.0.1:4102",
    fetch: async (url) => {
      urls.push(String(url));
      if (String(url) === "http://127.0.0.1:4101/api/runs/run-current") throw new Error("old endpoint unreachable");
      return new Response(null, { status: 200 });
    },
  });
  const current = { runId: "run-current", principalId: "owner-a" };
  const old = { runId: "run-old", principalId: "owner-b" };
  assert.equal(await client.runStatus(current, {}), 200);
  assert.equal(await client.runStatus(old, {}), 200);
  assert.equal((await client.openEvents(current, {})).status, 200);
  assert.equal((await client.openEvents(old, {})).status, 200);
  assert.deepEqual(urls, [
    "http://127.0.0.1:4101/api/runs/run-current", "http://127.0.0.1:4102/api/runs/run-current",
    "http://127.0.0.1:4101/api/runs/run-old", "http://127.0.0.1:4102/api/runs/run-current/events",
    "http://127.0.0.1:4101/api/runs/run-old/events",
  ]);
});

test("quiet live approval waits survive thirty minutes with one probe per renewal", async () => {
  let probes = 0;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const h = recoveryHarness({ daemon: { runStatus: async () => { probes++; return 200; }, openEvents: async () => new Response(body) } }, {});
  await h.finalizer.reconcileInterrupted({}, {});
  await h.elapse({ ms: 1_800_000 }, {});
  assert.equal(h.message.runStatus, "running"); assert.equal(h.message.content, "Partial answer");
  assert.equal(h.finalizer.activeCount(), 1);
  assert.equal(probes, 7, "one boot probe and one per five-minute renewal");
  controller.enqueue(new TextEncoder().encode('event: end\ndata: {"payload":{"status":"succeeded","code":0}}\n\n')); controller.close();
  await h.finalizer.idle();
  assert.equal(h.message.runStatus, "succeeded");
  assert.equal(h.finalizer.activeCount(), 0); assert.equal(h.timers.size, 0);
});
