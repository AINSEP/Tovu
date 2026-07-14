import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus } from "..";

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
