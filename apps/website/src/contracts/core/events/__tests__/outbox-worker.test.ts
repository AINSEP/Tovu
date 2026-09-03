import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "../index.js";

test("processOutbox publishes pending events and marks delivered", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  let handled = 0;
  await bus.subscribe("demo.event", async () => {
    handled += 1;
  });

  await outbox.enqueue({
    id: "evt-1",
    name: "demo.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { ok: true },
  });

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 1);
  assert.equal(handled, 1);
});

test("processOutbox respects optional batchSize", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  await outbox.enqueue({
    id: "evt-1",
    name: "demo.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { n: 1 },
  });
  await outbox.enqueue({
    id: "evt-2",
    name: "demo.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { n: 2 },
  });

  const processed = await processOutbox({ outbox, bus, clock }, { batchSize: 1 });
  assert.equal(processed, 1);
});

test("processOutbox catches Error during publish and marks row failed", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T12:00:00.000Z" };

  await bus.subscribe("fail.event", async () => {
    throw new Error("handler failed to execute");
  });

  await outbox.enqueue({
    id: "evt-fail",
    name: "fail.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 1);

  // The failed row should have been marked failed (status reset to pending, nextAttemptAt updated)
  const pendingAgain = await outbox.claimPending(10, "2026-02-21T12:00:00.000Z");
  assert.equal(pendingAgain.length, 1);
  assert.equal(pendingAgain[0].id, "evt-fail");
  assert.equal(pendingAgain[0].lastError, "handler failed to execute");
});

test("processOutbox catches non-Error during publish and marks row failed with fallback message", async () => {
  const outbox = new InMemoryOutbox();
  const bus = {
    publish: async () => {
      throw "literal string error";
    },
    subscribe: async () => {},
  } as unknown as InMemoryEventBus;
  const clock = { nowIso: () => "2026-02-21T12:00:00.000Z" };

  await outbox.enqueue({
    id: "evt-str-fail",
    name: "str.event",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 1);

  const pendingAgain = await outbox.claimPending(10, "2026-02-21T12:00:00.000Z");
  assert.equal(pendingAgain.length, 1);
  assert.equal(pendingAgain[0].lastError, "unknown outbox error");
});

test("processOutbox returns 0 when outbox has no pending records", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const clock = { nowIso: () => "2026-02-21T00:00:00.000Z" };

  const processed = await processOutbox({ outbox, bus, clock });
  assert.equal(processed, 0);
});

