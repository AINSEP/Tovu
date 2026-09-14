import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";

import { InMemoryEventBus, InMemoryOutbox, startOutboxDrainer } from "../index.js";

/**
 * @file `startOutboxDrainer`: the background loop that is the single owner of outbox delivery in a
 * site-serving process (2026-09-14). Real `InMemoryOutbox`/`InMemoryEventBus`, real timers with
 * short intervals.
 */

const clock = { nowIso: () => new Date().toISOString() };

function makeEvent(id: string): DomainEvent {
  return { id, name: "entry.updated", occurredAt: "2026-01-01T00:00:00.000Z", workspaceId: "ws-drainer", payload: {} };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(5);
  }
  return predicate();
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Delegating outbox that lets a test observe or fail individual port calls. */
function spyOutbox(inner: OutboxPort, hooks: { claimPending?: () => void; markDelivered?: (id: string) => void }): OutboxPort {
  return {
    enqueue: (event) => inner.enqueue(event),
    claimPending: async (batchSize, nowIso) => {
      hooks.claimPending?.();
      return inner.claimPending(batchSize, nowIso);
    },
    markDelivered: async (id) => {
      hooks.markDelivered?.(id);
      return inner.markDelivered(id);
    },
    markFailed: (id, error, nextAttemptAt, nextStatus) => inner.markFailed(id, error, nextAttemptAt, nextStatus),
  };
}

test("delivers a row enqueued after start, with no route calling processOutbox", async (t) => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const received: string[] = [];
  await bus.subscribe("entry.updated", async (event) => {
    received.push(event.id);
  });
  const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 10 });
  t.after(() => drainer.stop());

  await sleep(30);
  await outbox.enqueue(makeEvent("late-1"));

  assert.ok(await waitFor(() => received.length === 1), "the idle loop must pick up a row enqueued later");
  assert.deepEqual(received, ["late-1"]);
});

test("a full batch drains again at once instead of waiting the idle interval", async (t) => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const received: string[] = [];
  await bus.subscribe("entry.updated", async (event) => {
    received.push(event.id);
  });
  for (let i = 1; i <= 5; i += 1) await outbox.enqueue(makeEvent(`batch-${i}`));

  const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 60_000, batchSize: 2 });
  t.after(() => drainer.stop());

  assert.ok(await waitFor(() => received.length === 5), `only ${received.length}/5 delivered: a full batch must not wait 60s`);
});

test("a failing handler reschedules only its own row: the rows behind it are delivered and it is not retried hot", async (t) => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const received: string[] = [];
  let poisonAttempts = 0;
  await bus.subscribe("entry.updated", async (event) => {
    if (event.id === "poison") {
      poisonAttempts += 1;
      throw new Error("subscriber exploded");
    }
    received.push(event.id);
  });
  await outbox.enqueue(makeEvent("poison"));
  await outbox.enqueue(makeEvent("after-1"));
  await outbox.enqueue(makeEvent("after-2"));

  const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 5 });
  t.after(() => drainer.stop());

  assert.ok(await waitFor(() => received.length === 2), "rows queued behind a failing one must still be delivered");
  await sleep(60);
  assert.deepEqual(received, ["after-1", "after-2"]);
  assert.equal(poisonAttempts, 1, "the failed row must wait out processOutbox's backoff (>=15s), not spin every 5ms");
});

test("a drain that throws is reported to onError and the loop keeps delivering", async (t) => {
  const inner = new InMemoryOutbox();
  let claims = 0;
  const outbox = spyOutbox(inner, {
    claimPending: () => {
      claims += 1;
      if (claims === 1) throw new Error("database is locked");
    },
  });
  const bus = new InMemoryEventBus();
  const received: string[] = [];
  await bus.subscribe("entry.updated", async (event) => {
    received.push(event.id);
  });
  const errors: string[] = [];
  await inner.enqueue(makeEvent("after-error-1"));

  const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 5, onError: (error) => errors.push((error as Error).message) });
  t.after(() => drainer.stop());

  assert.ok(await waitFor(() => received.length === 1), "the loop must survive a drain that throws");
  assert.deepEqual(errors, ["database is locked"]);
});

test("an onError that throws cannot end the loop", async (t) => {
  const inner = new InMemoryOutbox();
  let claims = 0;
  const outbox = spyOutbox(inner, {
    claimPending: () => {
      claims += 1;
      if (claims === 1) throw new Error("database is locked");
    },
  });
  const bus = new InMemoryEventBus();
  const received: string[] = [];
  await bus.subscribe("entry.updated", async (event) => {
    received.push(event.id);
  });
  await inner.enqueue(makeEvent("after-bad-reporter-1"));

  const drainer = startOutboxDrainer(
    { outbox, bus, clock },
    {
      intervalMs: 5,
      onError: () => {
        throw new Error("reporter is broken too");
      },
    },
  );
  t.after(() => drainer.stop());

  assert.ok(await waitFor(() => received.length === 1), "a throwing reporter must not stop delivery");
});

test("a row is marked delivered only after its handler has finished", async (t) => {
  const inner = new InMemoryOutbox();
  const delivered: string[] = [];
  const outbox = spyOutbox(inner, { markDelivered: (id) => delivered.push(id) });
  const bus = new InMemoryEventBus();
  const gate = deferred();
  let handlerStarted = false;
  await bus.subscribe("entry.updated", async () => {
    handlerStarted = true;
    await gate.promise;
  });
  await inner.enqueue(makeEvent("slow-1"));

  const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 5 });
  t.after(() => drainer.stop());

  assert.ok(await waitFor(() => handlerStarted));
  await sleep(30);
  assert.deepEqual(delivered, [], "a row must not be marked delivered while its handler is still running");

  gate.resolve();
  assert.ok(await waitFor(() => delivered.length === 1));
  assert.deepEqual(delivered, ["slow-1"]);
});

test("stop() waits for the running drain, and no drain runs after it", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const gate = deferred();
  const received: string[] = [];
  await bus.subscribe("entry.updated", async (event) => {
    received.push(event.id);
    if (event.id === "in-flight-1") await gate.promise;
  });
  await outbox.enqueue(makeEvent("in-flight-1"));

  const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 5 });
  assert.ok(await waitFor(() => received.length === 1));

  let stopResolved = false;
  const stopping = drainer.stop().then(() => {
    stopResolved = true;
  });
  await sleep(30);
  assert.equal(stopResolved, false, "stop() must not resolve while a drain is still running");

  gate.resolve();
  await stopping;
  await outbox.enqueue(makeEvent("after-stop-1"));
  await sleep(50);
  assert.deepEqual(received, ["in-flight-1"], "no drain may run after stop()");
  await drainer.stop();
});

test("a handler that never settles cannot stall the loop: the event behind it is delivered and the stuck row stays retryable, never delivered", async (t) => {
  const inner = new InMemoryOutbox();
  const delivered: string[] = [];
  const outbox = spyOutbox(inner, { markDelivered: (id) => delivered.push(id) });
  const bus = new InMemoryEventBus();
  const stuck = deferred();
  const received: string[] = [];
  await bus.subscribe("entry.updated", async (event) => {
    if (event.id === "never-settles") return stuck.promise;
    received.push(event.id);
  });
  await inner.enqueue(makeEvent("never-settles"));

  const drainer = startOutboxDrainer({ outbox, bus, clock }, { intervalMs: 5, deliveryTimeoutMs: 20 });
  t.after(async () => {
    stuck.resolve();
    await drainer.stop();
  });

  await sleep(10);
  await inner.enqueue(makeEvent("after-stuck-1"));

  assert.ok(
    await waitFor(() => received.length === 1),
    "a handler that never settles stalled the drainer: the event queued behind it was never delivered"
  );
  assert.deepEqual({ received, delivered }, { received: ["after-stuck-1"], delivered: ["after-stuck-1"] });
  const retry = await inner.claimPending(10, "2099-01-01T00:00:00.000Z");
  assert.deepEqual(
    retry.map((row) => [row.id, row.lastError]),
    [["never-settles", 'delivery of outbox event "entry.updated" (never-settles) timed out after 20ms']]
  );
});
