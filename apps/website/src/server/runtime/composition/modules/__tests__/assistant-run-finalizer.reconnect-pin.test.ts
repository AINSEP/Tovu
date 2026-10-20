import assert from "node:assert/strict";
import test from "node:test";
import type { SupervisorScheduler } from "@jini-ai/sidecar/supervisor";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { DurableRunStore } from "#src/assistant/durable-runs/ports";
import type { ChatRunLedger, RunSettlement } from "#src/assistant/index";
import { createAssistantRunFinalizer, type RunDaemonClient } from "../assistant-run-finalizer.js";

/** TW2 L136: characterize reconnect decisions before simplifying the follow loop. */
function ledgerFixture() {
  const settled: RunSettlement[] = [];
  const ledger: ChatRunLedger = {
    unlessSettled: async (_run, write) => ({ written: true, value: await write() }),
    checkpoint: async () => true,
    settle: async value => { settled.push(value); return true; },
    reconcileInterrupted: async () => 0,
  };
  return { ledger, settled };
}
// Referenced timers keep a standalone node:test alive until each watch resolves.
const scheduler: SupervisorScheduler = { schedule({ delayMs, run }) {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
} };
const message: ChatMessage = { id: "answer", role: "assistant", content: "", runId: "run-pin", runStatus: "running", createdAt: 0 };
const ended = () => new Response('event: end\ndata: {"kind":"end","payload":{"status":"succeeded","code":0}}\n\n');

for (const status of [200, 404, 503, null]) {
  test(`reconnect pins: fresh status ${status} after a dropped stream`, async () => {
    const { ledger, settled } = ledgerFixture();
    let opens = 0;
    const daemon: RunDaemonClient = {
      openEvents: async () => ++opens === 1 ? new Response("") : ended(),
      runStatus: async () => status,
    };
    const finalizer = createAssistantRunFinalizer({ ledger, daemon, scheduler, maxReconnects: 0, reconnectDelayMs: 0 });
    finalizer.watch({ principalId: "owner", conversationId: "chat", message });
    await finalizer.idle();
    assert.equal(opens, status === 200 ? 2 : 1);
    assert.deepEqual(settled.map(value => value.status), status === 200 ? ["succeeded"] : status === 404 ? ["canceled"] : []);
    assert.equal(finalizer.activeCount(), 0);
  });
}

test("reconnect pins: events 404 cannot override live status, and live runs survive repeated reconnect exhaustion", async () => {
  const { ledger, settled } = ledgerFixture();
  let opens = 0;
  const daemon: RunDaemonClient = {
    openEvents: async () => ++opens <= 3 ? new Response(null, { status: 404 }) : ended(),
    runStatus: async () => 200,
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, scheduler, maxReconnects: 0, reconnectDelayMs: 0 });
  finalizer.watch({ principalId: "owner", conversationId: "chat", message });
  await finalizer.idle();
  assert.equal(opens, 4);
  assert.equal(settled[0]?.status, "succeeded");
});

test("reconnect pins: inconclusive probes retry before the limit and events 404 resolves immediately", async () => {
  for (const status of [200, 404]) {
    const { ledger, settled } = ledgerFixture();
    let opens = 0;
    const daemon: RunDaemonClient = {
      openEvents: async () => ++opens === 1 ? new Response("", { status }) : ended(),
      runStatus: async () => null,
    };
    const finalizer = createAssistantRunFinalizer({ ledger, daemon, scheduler, maxReconnects: 2, reconnectDelayMs: 0 });
    finalizer.watch({ principalId: "owner", conversationId: "chat", message });
    await finalizer.idle();
    assert.equal(opens, status === 200 ? 2 : 1);
    assert.equal(settled.length, status === 200 ? 1 : 0);
  }
});


test("reconnect pins: durable recovery relinquishing a live attempt stops its watch", async () => {
  const { ledger, settled } = ledgerFixture();
  const durable: DurableRunStore = {
    load: async () => null,
    find: async () => null,
    accept: async () => null,
    advance: async () => assert.fail("must not advance an absent durable row"),
    cancel: async () => assert.fail("must not cancel an absent durable row"),
    cancelPending: async () => null,
    captureSession: async () => false,
    clearSession: async () => undefined,
    recoveryClock: async () => undefined,
    guardTool: async () => "unknown",
    completeTool: async () => undefined,
  };
  let opens = 0;
  const daemon: RunDaemonClient = {
    openEvents: async () => { opens++; return new Response(""); },
    runStatus: async () => 200,
  };
  const finalizer = createAssistantRunFinalizer({ ledger: { ...ledger, durable }, daemon, scheduler, reconnectDelayMs: 0 });
  finalizer.watch({ principalId: "owner", conversationId: "chat", message });
  await finalizer.idle();
  assert.equal(opens, 1);
  assert.equal(settled.length, 0);
  assert.equal(finalizer.activeCount(), 0);
});

test("reconnect pins: elapsed deadline resolves an inconclusive dropped stream before retry exhaustion", async () => {
  const { ledger, settled } = ledgerFixture();
  let now = 0;
  let opens = 0;
  const daemon: RunDaemonClient = {
    openEvents: async () => { opens++; now = 100; return new Response(""); },
    runStatus: async () => null,
  };
  const finalizer = createAssistantRunFinalizer({ ledger, daemon, scheduler, now: () => now, resolutionTimeoutMs: 10, maxReconnects: 30 });
  finalizer.watch({ principalId: "owner", conversationId: "chat", message });
  await finalizer.idle();
  assert.equal(opens, 1);
  assert.equal(settled.length, 0);
});
