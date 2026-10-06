import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import type { ChatRunLedger, RunSettlement } from "#src/assistant/index";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import {
  createAssistantRunFinalizer,
  createHttpRunDaemonClient,
  type RunDaemonClient,
} from "../runtime/composition/modules/assistant-run-finalizer.js";

const RESTART_NOTICE = {
  kind: "status" as const,
  label: "The assistant restarted while this answer was running, so it stopped.",
  detail: "Anything it wrote before the restart is kept above. Send your message again to retry.",
};

/** Acceptance: uncertainty has a deadline, but a fresh answer from the owning daemon renews
 * recovery. Time, persistence and HTTP are ports; no processes, listeners or module mocks. */
async function flush() {
  for (let turn = 0; turn < 40; turn++) await Promise.resolve();
}

function recoveryHarness(required: { daemon: RunDaemonClient }, _optional = {}) {
  let time = 1000;
  const timers = new Set<{ at: number; run: () => void }>();
  const scheduler: SupervisorScheduler = {
    schedule({ delayMs, run }) {
      const timer = { at: time + delayMs, run };
      timers.add(timer);
      return () => { timers.delete(timer); };
    },
  };
  const partial = { kind: "text" as const, text: "Partial answer" };
  const message: ChatMessage = {
    id: "answer", role: "assistant", content: "Partial answer", events: [partial], runId: "run-old", runStatus: "running",
  };
  const settlements: RunSettlement[] = [];
  const ledger: ChatRunLedger = {
    unlessSettled: async (_run, write) => ({ written: true, value: await write() }),
    checkpoint: async () => true,
    settle: async (input) => {
      settlements.push(input);
      Object.assign(message, { runStatus: input.status, content: input.content, events: [...input.events], endedAt: input.endedAt });
      return true;
    },
    reconcileInterrupted: async ({ now = time } = {}, optional = {}) => {
      if (await optional.recover?.({ principalId: "owner", conversationId: "chat", message: { ...message } })) return 0;
      Object.assign(message, { runStatus: "canceled", events: [partial, RESTART_NOTICE], endedAt: now });
      return 1;
    },
  };
  const finalizer = createAssistantRunFinalizer({
    ledger, recoveryDaemon: required.daemon, now: () => time, scheduler,
    resolutionTimeoutMs: 100, statusTimeoutMs: 10, reconnectDelayMs: 1, maxReconnects: 2,
  }, {});
  async function elapse({ ms }: { ms: number }, _optional = {}) {
    await flush();
    const end = time + ms;
    for (;;) {
      const timer = [...timers].filter((entry) => entry.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!timer) break;
      time = timer.at;
      timers.delete(timer);
      timer.run();
      await flush();
    }
    time = end;
    await flush();
  }
  function assertCanceled({ endedAt }: { endedAt: number }, _optional = {}) {
    assert.deepEqual(message, {
      id: "answer", role: "assistant", content: "Partial answer", events: [partial, RESTART_NOTICE],
      runId: "run-old", runStatus: "canceled", endedAt,
    });
    assert.equal(finalizer.activeCount(), 0);
  }
  return { finalizer, message, settlements, elapse, assertCanceled, timers };
}

test("current daemon reachable and run unknown with old daemon dead cancels with restart notice", async () => {
  const urls: string[] = [];
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4101", pid: 77 }),
    isAlive: ({ pid }) => { assert.equal(pid, 77); return false; },
    currentUrl: () => "http://127.0.0.1:4102",
    fetch: async (url) => { urls.push(String(url)); return new Response(null, { status: 404 }); },
  });
  const h = recoveryHarness({ daemon: client }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 1);
  h.assertCanceled({ endedAt: 1000 }, {});
  assert.deepEqual(urls, ["http://127.0.0.1:4102/api/runs/run-old"]);
  assert.deepEqual(h.settlements, []);
});

test("a reused old PID with an unreachable daemon permits the current daemon's unknown-run proof", async () => {
  const urls: string[] = [];
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4101", pid: 77 }),
    isAlive: () => true,
    currentUrl: () => "http://127.0.0.1:4102",
    fetch: async (url) => {
      urls.push(String(url));
      if (String(url).includes(":4101/")) throw new Error("connection refused");
      return new Response(null, { status: 404 });
    },
  });
  const h = recoveryHarness({ daemon: client }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 1);
  h.assertCanceled({ endedAt: 1000 }, {});
  assert.deepEqual(urls, ["http://127.0.0.1:4101/api/runs/run-old", "http://127.0.0.1:4102/api/runs/run-old"]);
});

test("no proof within the hard bound cancels a stalled event request with restart notice", async () => {
  let statuses = 0;
  const h = recoveryHarness({ daemon: {
    runStatus: async () => { statuses++; return null; },
    openEvents: async () => new Promise<Response>(() => {}),
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 99 }, {});
  assert.equal(h.message.runStatus, "running");
  await h.elapse({ ms: 1 }, {});
  await h.finalizer.idle();
  h.assertCanceled({ endedAt: 1100 }, {});
  assert.equal(statuses, 2);
  assert.deepEqual(h.settlements, [{
    conversationId: "chat", messageId: "answer", runId: "run-old", status: "canceled",
    content: "Partial answer", events: [{ kind: "text", text: "Partial answer" }, RESTART_NOTICE], endedAt: 1100,
  }]);
  assert.equal(h.timers.size, 0);
});

test("a stalled status probe is bounded at boot and again at the recovery deadline", async () => {
  const h = recoveryHarness({ daemon: {
    runStatus: async () => new Promise<number | null>(() => {}),
    openEvents: async () => new Promise<Response>(() => {}),
  } }, {});
  const boot = h.finalizer.reconcileInterrupted({}, {});
  await h.elapse({ ms: 10 }, {});
  assert.equal(await boot, 0);
  await h.elapse({ ms: 109 }, {});
  assert.equal(h.message.runStatus, "running");
  await h.elapse({ ms: 1 }, {});
  await h.finalizer.idle();
  h.assertCanceled({ endedAt: 1120 }, {});
  assert.equal(h.timers.size, 0);
});

test("no proof within the hard bound cancels a quiet stream and preserves its saved checkpoint", async () => {
  let canceled = false;
  const h = recoveryHarness({ daemon: {
    runStatus: async () => null,
    openEvents: async () => new Response(new ReadableStream<Uint8Array>({ cancel() { canceled = true; } })),
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 100 }, {});
  await h.finalizer.idle();
  h.assertCanceled({ endedAt: 1100 }, {});
  assert.equal(canceled, true);
  assert.equal(h.timers.size, 0);
});

test("bounded cancellation preserves a checkpoint longer than a replay with the same event count", async () => {
  const h = recoveryHarness({ daemon: {
    runStatus: async () => null,
    openEvents: async () => new Response(`event: agent\ndata: ${JSON.stringify({ kind: "agent", payload: { type: "text_delta", delta: "Part" } })}\n\n`),
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 2 }, {});
  await h.finalizer.idle();
  h.assertCanceled({ endedAt: 1002 }, {});
  assert.equal(h.timers.size, 0);
});

test("a terminal frame during the final status probe wins over bounded cancellation", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let resolveStatus!: (status: number) => void;
  let statuses = 0;
  const h = recoveryHarness({ daemon: {
    runStatus: async () => ++statuses === 1 ? null : new Promise<number>((resolve) => { resolveStatus = resolve; }),
    openEvents: async () => new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } })),
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 100 }, {});
  controller.enqueue(new TextEncoder().encode(
    `event: agent\ndata: ${JSON.stringify({ kind: "agent", payload: { type: "text_delta", delta: "Finished" } })}\n\n` +
    `event: end\ndata: ${JSON.stringify({ kind: "end", payload: { status: "succeeded", code: 0 } })}\n\n`,
  ));
  controller.close();
  await flush();
  resolveStatus(503);
  await h.finalizer.idle();
  assert.deepEqual(h.message, {
    id: "answer", role: "assistant", content: "Finished", events: [{ kind: "text", text: "Finished" }],
    runId: "run-old", runStatus: "succeeded", endedAt: 1100,
  });
  assert.equal(h.settlements.length, 1);
  assert.equal(h.timers.size, 0);
});

test("inconclusive reconnect exhaustion cancels instead of leaving an adopted row running", async () => {
  let opened = 0;
  const h = recoveryHarness({ daemon: {
    runStatus: async () => 503,
    openEvents: async () => { opened++; return new Response(null, { status: 503 }); },
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 2 }, {});
  await h.finalizer.idle();
  h.assertCanceled({ endedAt: 1002 }, {});
  assert.equal(opened, 3);
  assert.equal(h.timers.size, 0);
});

test("an old daemon still reporting the run live is never canceled at the hard bound", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const urls: string[] = [];
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4101", pid: 77 }),
    isAlive: () => true,
    currentUrl: () => "http://127.0.0.1:4102",
    fetch: async (url) => {
      urls.push(String(url));
      if (String(url).endsWith("/events")) return new Response(new ReadableStream({ start(value) { controller = value; } }));
      return new Response(null, { status: String(url).includes(":4101/") ? 200 : 404 });
    },
  });
  const h = recoveryHarness({ daemon: client }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 300 }, {});
  assert.equal(h.message.runStatus, "running");
  assert.deepEqual(h.settlements, []);
  assert.equal(h.finalizer.activeCount(), 1);
  assert.deepEqual(urls, [
    "http://127.0.0.1:4101/api/runs/run-old", "http://127.0.0.1:4101/api/runs/run-old/events",
    "http://127.0.0.1:4101/api/runs/run-old", "http://127.0.0.1:4101/api/runs/run-old", "http://127.0.0.1:4101/api/runs/run-old",
  ]);
  controller.enqueue(new TextEncoder().encode(
    `event: agent\ndata: ${JSON.stringify({ kind: "agent", payload: { type: "text_delta", delta: "Recovered" } })}\n\n` +
    `event: end\ndata: ${JSON.stringify({ kind: "end", payload: { status: "succeeded", code: 0 } })}\n\n`,
  ));
  controller.close();
  await h.finalizer.idle();
  assert.equal(h.message.runStatus, "succeeded");
  assert.equal(h.message.content, "Recovered");
  assert.equal(h.message.endedAt, 1300);
  assert.equal(h.timers.size, 0);
});

test("an adopted live run stays watched beyond reconnect exhaustion and settles when it disappears", async () => {
  let status = 200;
  let opened = 0;
  const h = recoveryHarness({ daemon: {
    runStatus: async () => status,
    openEvents: async () => { opened++; return new Response(null, { status: 503 }); },
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 5 }, {});
  assert.equal(opened, 6);
  assert.equal(h.message.runStatus, "running");
  assert.equal(h.finalizer.activeCount(), 1);
  assert.deepEqual(h.settlements, []);
  status = 404;
  await h.elapse({ ms: 1 }, {});
  await h.finalizer.idle();
  h.assertCanceled({ endedAt: 1006 }, {});
});

test("a stream 404 cannot cancel a run the owning daemon still reports live", async () => {
  let status = 200;
  let opened = 0;
  const h = recoveryHarness({ daemon: {
    runStatus: async () => status,
    openEvents: async () => { opened++; return new Response(null, { status: 404 }); },
  } }, {});
  assert.equal(await h.finalizer.reconcileInterrupted({}, {}), 0);
  await h.elapse({ ms: 2 }, {});
  assert.equal(opened, 3);
  assert.equal(h.message.runStatus, "running");
  assert.deepEqual(h.settlements, []);
  assert.equal(h.finalizer.activeCount(), 1);
  status = 404;
  await h.elapse({ ms: 1 }, {});
  await h.finalizer.idle();
  h.assertCanceled({ endedAt: 1003 }, {});
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
