import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus } from "../index.js";

test("subscribeAll delivers events of several different names to one handler", async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];

  await bus.subscribeAll(async (event) => {
    seen.push(event.name);
  });

  await bus.publish({
    id: "evt-1",
    name: "workspace.created",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });
  await bus.publish({
    id: "evt-2",
    name: "entry.published",
    occurredAt: "2026-02-21T00:00:01.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  assert.deepEqual(seen, ["workspace.created", "entry.published"]);
});

test("subscribeAll's unsubscriber stops delivery", async () => {
  const bus = new InMemoryEventBus();
  let count = 0;

  const unsubscribe = await bus.subscribeAll(async () => {
    count += 1;
  });

  await bus.publish({
    id: "evt-1",
    name: "workspace.created",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });
  assert.equal(count, 1);

  await unsubscribe();

  await bus.publish({
    id: "evt-2",
    name: "workspace.created",
    occurredAt: "2026-02-21T00:00:01.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });
  assert.equal(count, 1);
});

test("subscribeAll handlers run alongside per-name subscribe handlers", async () => {
  const bus = new InMemoryEventBus();
  const order: string[] = [];

  await bus.subscribe("workspace.created", async () => {
    order.push("named");
  });
  await bus.subscribeAll(async () => {
    order.push("all");
  });

  await bus.publish({
    id: "evt-1",
    name: "workspace.created",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  assert.deepEqual(order, ["named", "all"]);
});

test("publishBatch delivers every event, in order, to a subscribeAll handler", async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];

  await bus.subscribeAll(async (event) => {
    seen.push(event.name);
  });

  await bus.publishBatch([
    {
      id: "evt-1",
      name: "workspace.created",
      occurredAt: "2026-02-21T00:00:00.000Z",
      workspaceId: "workspace-1",
      payload: {},
    },
    {
      id: "evt-2",
      name: "entry.published",
      occurredAt: "2026-02-21T00:00:01.000Z",
      workspaceId: "workspace-1",
      payload: {},
    },
    {
      id: "evt-3",
      name: "entry.unpublished",
      occurredAt: "2026-02-21T00:00:02.000Z",
      workspaceId: "workspace-1",
      payload: {},
    },
  ]);

  assert.deepEqual(seen, ["workspace.created", "entry.published", "entry.unpublished"]);
});

test("publishBatch on an empty array delivers nothing", async () => {
  const bus = new InMemoryEventBus();
  let calls = 0;

  await bus.subscribeAll(async () => {
    calls += 1;
  });

  await bus.publishBatch([]);

  assert.equal(calls, 0);
});

test("subscribe's unsubscriber removes only that handler, leaving a second handler on the same event name intact", async () => {
  const bus = new InMemoryEventBus();
  const firstSeen: string[] = [];
  const secondSeen: string[] = [];

  const unsubscribeFirst = await bus.subscribe("workspace.created", async (event) => {
    firstSeen.push(event.name);
  });
  await bus.subscribe("workspace.created", async (event) => {
    secondSeen.push(event.name);
  });

  await unsubscribeFirst();

  await bus.publish({
    id: "evt-1",
    name: "workspace.created",
    occurredAt: "2026-02-21T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  });

  assert.deepEqual(firstSeen, [], "the unsubscribed handler must not run");
  assert.deepEqual(secondSeen, ["workspace.created"], "the still-subscribed handler must still run");
});
