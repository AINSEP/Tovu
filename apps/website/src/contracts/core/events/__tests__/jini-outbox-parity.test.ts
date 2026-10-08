import assert from "node:assert/strict";
import test from "node:test";
import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import { InMemoryEventBus, InMemoryOutbox, processOutbox, startOutboxDrainer, toEnqueueOnlyOutbox } from "../index.js";

const NOW = "2026-10-07T00:00:00.000Z";
const event: DomainEvent = {
  id: "jini-parity", name: "entry.updated", occurredAt: NOW, workspaceId: "ws-parity",
  actorId: "operator-7", metadata: { correlationId: "run-9" }, payload: { entryId: "post-23", title: "Preserved title" },
};

/** Controlled handler completion makes competing claims observable without wall-clock sleeps. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// These test a single execution inside a live lease, not exactly-once delivery across a crash.
// Unfenced persisted claims remain at-least-once; changing that would require a storage decision.
for (const storage of ["memory", "sqlite"] as const) {
  test(`${storage}: competing drains execute the full event once within its live lease`, async (t) => {
    const db = storage === "sqlite" ? openContentDb(":memory:") : undefined;
    if (db) t.after(() => db.$client.close());
    const outbox: OutboxPort = db ? new SqliteOutboxAdapter(db) : new InMemoryOutbox();
    const bus = new InMemoryEventBus();
    const started = deferred();
    const finish = deferred();
    const received: DomainEvent[] = [];
    await bus.subscribe<DomainEvent["payload"]>({ eventName: event.name, handler: async (delivered) => {
      received.push(delivered);
      started.resolve();
      await finish.promise;
    } });
    await outbox.enqueue(event);
    const required = { outbox, bus, clock: { nowMs: () => Date.parse(NOW) } };
    const first = processOutbox(required);
    t.after(async () => { finish.resolve(); await first; });
    await started.promise;

    assert.equal(await processOutbox(required), 0);
    assert.deepEqual(received, [event]);
    finish.resolve();
    assert.equal(await first, 1);
    assert.equal(await processOutbox(required), 0);
    assert.deepEqual(received, [event]);
    assert.deepEqual(await outbox.claimPending({ batchSize: 20, nowIso: "2099-01-01T00:00:00.000Z" }), []);
  });
}

test("persisted legacy bytes survive the daemon boundary, failure backoff, and serving delivery", async (t) => {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  // Seed pre-existing bytes, rather than round-tripping through JSON.stringify: a new adapter
  // must not normalize whitespace, reorder properties, or invent a fencing field on adoption.
  const eventJson = '{ "payload": {"entryId":"post-23","title":"Preserved title"}, "id":"jini-parity", "name":"entry.updated", "occurredAt":"2026-10-07T00:00:00.000Z", "workspaceId":"ws-parity", "actorId":"operator-7", "metadata":{"correlationId":"run-9"} }';
  db.$client.prepare("INSERT INTO outbox_events (id, workspace_id, event_json, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(event.id, event.workspaceId, eventJson, "pending", 0, NOW, NOW);
  const snapshot = () => db.$client.prepare("SELECT * FROM outbox_events WHERE id = ?").get(event.id) as Record<string, unknown>;
  const initial = snapshot();
  const outbox = new SqliteOutboxAdapter(db);
  const daemon = toEnqueueOnlyOutbox(outbox);
  const bus = new InMemoryEventBus();
  const received: DomainEvent[] = [];
  await bus.subscribe<DomainEvent["payload"]>({ eventName: event.name, handler: async (delivered) => {
    received.push(delivered);
    if (received.length === 1) throw new Error("subscriber unavailable");
  } });
  let nowMs = Date.parse(NOW);
  const clock = { nowMs: () => nowMs };
  assert.equal(await processOutbox({ outbox: daemon, bus, clock }), 0);
  assert.deepEqual(snapshot(), initial);
  assert.deepEqual(received, []);

  assert.equal(await processOutbox({ outbox, bus, clock }, { random: () => 0 }), 1);
  assert.deepEqual(snapshot(), {
    ...initial, status: "pending", attempts: 1, last_error: "subscriber unavailable", next_attempt_at: "2026-10-07T00:00:15.000Z",
  });
  nowMs += 14_999;
  assert.equal(await processOutbox({ outbox, bus, clock }), 0);
  nowMs += 1;
  assert.equal(await processOutbox({ outbox, bus, clock }), 1);
  assert.deepEqual(received, [event, event]);
  assert.deepEqual(snapshot(), {
    ...initial, status: "delivered", attempts: 2, last_error: "subscriber unavailable", next_attempt_at: "2026-10-07T00:30:15.000Z",
  });
  assert.equal(await processOutbox({ outbox, bus, clock }), 0);
});

test("persisted poison rows get exactly six attempts with the historical retry times and terminal status", async (t) => {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  const outbox = new SqliteOutboxAdapter(db);
  const bus = new InMemoryEventBus();
  let attempts = 0;
  await bus.subscribe({ eventName: event.name, handler: async () => {
    attempts += 1;
    throw new Error("permanent subscriber failure");
  } });
  await outbox.enqueue(event);
  let nowMs = Date.parse(NOW);
  const clock = { nowMs: () => nowMs };
  const delays = [15_000, 30_000, 60_000, 120_000, 240_000, 480_000];
  for (const [index, delay] of delays.entries()) {
    assert.equal(await processOutbox({ outbox, bus, clock }, { random: () => 0 }), 1);
    const stored = db.$client.prepare("SELECT status, attempts, next_attempt_at, last_error, event_json FROM outbox_events WHERE id = ?").get(event.id);
    assert.deepEqual(stored, {
      status: index === 5 ? "failed" : "pending", attempts: index + 1,
      next_attempt_at: new Date(nowMs + delay).toISOString(), last_error: "permanent subscriber failure", event_json: JSON.stringify(event),
    });
    assert.equal(await processOutbox({ outbox, bus, clock }), 0);
    nowMs += delay;
  }
  nowMs = Date.parse("2099-01-01T00:00:00.000Z");
  assert.equal(await processOutbox({ outbox, bus, clock }), 0);
  assert.equal(attempts, 6);
});

test("only the explicitly started serving drainer executes effects; inline drains and stop cannot duplicate them", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const outbox = new InMemoryOutbox();
  const daemon = toEnqueueOnlyOutbox(outbox);
  const bus = new InMemoryEventBus();
  const started = deferred();
  const finish = deferred();
  const received: DomainEvent[] = [];
  await bus.subscribe<DomainEvent["payload"]>({ eventName: event.name, handler: async (delivered) => {
    received.push(delivered);
    started.resolve();
    await finish.promise;
  } });
  const clock = { nowMs: () => Date.parse(NOW) };
  await daemon.enqueue(event);
  assert.equal(await processOutbox({ outbox: daemon, bus, clock }), 0);
  t.mock.timers.tick(1_000);
  assert.deepEqual(received, [], "constructing an enqueue-only adapter must never start a loop");

  const drainer = startOutboxDrainer({ outbox, bus, clock }, { batchSize: 1, intervalMs: 10 });
  t.after(async () => { finish.resolve(); await drainer.stop(); });
  assert.deepEqual(received, [], "the first drain must be deferred until subscribers are attached");
  t.mock.timers.tick(0);
  await started.promise;
  assert.equal(await processOutbox({ outbox, bus, clock }), 0);
  const stopping = drainer.stop();
  let stopped = false;
  void stopping.then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false, "stop must wait for its in-flight delivery");
  finish.resolve();
  await stopping;
  assert.equal(stopped, true);
  const second = { ...event, id: "after-stop" };
  await daemon.enqueue(second);
  t.mock.timers.tick(1_000);
  assert.deepEqual(received, [event]);
  assert.deepEqual((await outbox.claimPending({ batchSize: 20, nowIso: NOW })).map((row) => row.event), [second]);
});
