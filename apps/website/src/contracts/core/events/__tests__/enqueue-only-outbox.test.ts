import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";

import { InMemoryEventBus, InMemoryOutbox, processOutbox, toEnqueueOnlyOutbox } from "../index.js";

/**
 * @file `toEnqueueOnlyOutbox`: the outbox view for a process that must write events but never
 * deliver them (the agent daemon, 2026-09-14).
 */

const clock = { nowIso: () => new Date().toISOString() };

function makeEvent(id: string): DomainEvent {
  return { id, name: "entry.updated", occurredAt: "2026-01-01T00:00:00.000Z", workspaceId: "ws-enqueue-only", payload: {} };
}

test("enqueue passes through to the real outbox", async () => {
  const inner = new InMemoryOutbox();
  const view = toEnqueueOnlyOutbox(inner);

  await view.enqueue(makeEvent("through-1"));

  const claimed = await inner.claimPending(10, "2099-01-01T00:00:00.000Z");
  assert.deepEqual(claimed.map((row) => row.id), ["through-1"]);
});

test("a drain through the view claims and publishes nothing, leaving the row pending for the real owner", async () => {
  const inner = new InMemoryOutbox();
  const view = toEnqueueOnlyOutbox(inner);
  const bus = new InMemoryEventBus();
  const received: string[] = [];
  await bus.subscribe("entry.updated", async (event) => {
    received.push(event.id);
  });
  await view.enqueue(makeEvent("owned-elsewhere-1"));

  assert.equal(await processOutbox({ outbox: view, bus, clock }), 0);
  assert.deepEqual(received, []);

  assert.equal(await processOutbox({ outbox: inner, bus, clock }), 1, "the owning process must still find the row pending");
  assert.deepEqual(received, ["owned-elsewhere-1"]);
});

test("markDelivered and markFailed reject, naming the row, because this view never hands out a claim", async () => {
  const view = toEnqueueOnlyOutbox(new InMemoryOutbox());

  await assert.rejects(view.markDelivered("row-1"), {
    message: "enqueue-only outbox: markDelivered('row-1') was called, but this process never claims outbox rows",
  });
  await assert.rejects(view.markFailed("row-2", "boom", "2026-01-01T00:00:00.000Z", "pending"), {
    message: "enqueue-only outbox: markFailed('row-2') was called, but this process never claims outbox rows",
  });
});
