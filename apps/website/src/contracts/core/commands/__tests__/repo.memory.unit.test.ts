import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "../repo.memory.js";
import type { ChangeSetItemRecord, ChangeSetRecord, DomainEvent, OutboxPort } from "@jini-ai/cms/core";

function makeRecord(overrides: Partial<ChangeSetRecord> = {}): ChangeSetRecord {
  return {
    id: overrides.id ?? "cs-1",
    workspaceId: "workspace-1",
    actorId: "user-1",
    status: "applied",
    summary: "Summary",
    createdAt: "2026-07-16T00:00:00.000Z",
    appliedAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeItem(changeSetId: string, overrides: Partial<ChangeSetItemRecord> = {}): ChangeSetItemRecord {
  return {
    id: overrides.id ?? `${changeSetId}-item-1`,
    changeSetId,
    entityType: "post",
    entityId: "post-1",
    operation: "update",
    position: 0,
    ...overrides,
  };
}

test("InMemoryChangeSetRepo: constructor initializes with default and custom initial rows/items", async () => {
  const initialRecord = makeRecord({ id: "init-cs" });
  const initialItem = makeItem("init-cs", { id: "init-item" });
  const repo = new InMemoryChangeSetRepo([initialRecord], [initialItem]);

  const found = await repo.findById({ workspaceId: "workspace-1", id: "init-cs" });
  assert.ok(found);
  assert.equal(found?.changeSet.id, "init-cs");
  assert.equal(found?.items.length, 1);
  assert.equal(found?.items[0].id, "init-item");
});

test("InMemoryChangeSetRepo: insert forwards event to outbox when outbox is provided", async () => {
  const enqueued: DomainEvent[] = [];
  const outbox: OutboxPort = {
    enqueue: async (evt) => {
      enqueued.push(evt);
    },
    claimPending: async () => [],
    markDelivered: async () => {},
    markFailed: async () => {},
  };

  const repo = new InMemoryChangeSetRepo([], [], outbox);
  const event: DomainEvent = {
    id: "evt-1",
    name: "changeset.applied",
    occurredAt: "2026-07-16T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  };

  await repo.insert(makeRecord({ id: "cs-evt" }), [], event);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].id, "evt-1");
});

test("InMemoryChangeSetRepo: insert handles event when outbox is omitted without error", async () => {
  const repo = new InMemoryChangeSetRepo();
  const event: DomainEvent = {
    id: "evt-2",
    name: "changeset.applied",
    occurredAt: "2026-07-16T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: {},
  };

  await repo.insert(makeRecord({ id: "cs-no-outbox" }), [], event);
  const found = await repo.findById({ workspaceId: "workspace-1", id: "cs-no-outbox" });
  assert.ok(found);
});

test("InMemoryChangeSetRepo: save appends record if not found by id", async () => {
  const repo = new InMemoryChangeSetRepo();
  const newRecord = makeRecord({ id: "cs-new" });

  await repo.save(newRecord);
  const found = await repo.findById({ workspaceId: "workspace-1", id: "cs-new" });
  assert.ok(found);
  assert.equal(found?.changeSet.id, "cs-new");
});

test("InMemoryChangeSetRepo: findByIdempotencyKey finds by key and returns null when not found", async () => {
  const repo = new InMemoryChangeSetRepo();
  await repo.insert(makeRecord({ id: "cs-key", idempotencyKey: "test-key" }), []);

  const found = await repo.findByIdempotencyKey({ workspaceId: "workspace-1", idempotencyKey: "test-key" });
  assert.equal(found?.id, "cs-key");

  const notFound = await repo.findByIdempotencyKey({ workspaceId: "workspace-1", idempotencyKey: "no-key" });
  assert.equal(notFound, null);
});

test("InMemoryChangeSetRepo: save updates existing record", async () => {
  const repo = new InMemoryChangeSetRepo();
  const record = makeRecord({ id: "cs-update", summary: "Before" });
  await repo.insert(record, []);

  await repo.save({ ...record, summary: "After" });
  const found = await repo.findById({ workspaceId: "workspace-1", id: "cs-update" });
  assert.equal(found?.changeSet.summary, "After");
});

test("InMemoryChangeSetRepo: listByWorkspace sorts correctly by createdAt descending", async () => {
  const repo = new InMemoryChangeSetRepo();
  await repo.insert(makeRecord({ id: "cs-older", createdAt: "2026-07-15T00:00:00.000Z" }), []);
  await repo.insert(makeRecord({ id: "cs-newer", createdAt: "2026-07-16T00:00:00.000Z" }), []);
  await repo.insert(makeRecord({ id: "cs-same", createdAt: "2026-07-16T00:00:00.000Z" }), []);

  const list = await repo.listByWorkspace({ workspaceId: "workspace-1" });
  assert.equal(list.length, 3);
  assert.equal(list[2].id, "cs-older");
});


