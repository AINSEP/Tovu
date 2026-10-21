import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryDeliveryEnvelopeStore,
  InMemoryWebhookDeliveryRepo,
  InMemoryWebhookSubscriptionRepo,
} from "../repo.memory.js";
import type { WebhookDeliveryRecord, WebhookSubscriptionRecord } from "../types.js";

function makeSubscription(overrides: Partial<WebhookSubscriptionRecord> = {}): WebhookSubscriptionRecord {
  return {
    id: "sub-1",
    workspaceId: "workspace-1",
    ownerPrincipalId: "principal-1",
    label: "Endpoint",
    targetUrl: "https://example.com/hooks",
    topics: ["post.published"],
    secretVersion: 1,
    previousSecretVersion: null,
    status: "active",
    createdByPrincipalId: "principal-1",
    createdByPluginId: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    disabledAt: null,
    ...overrides,
  };
}

function makeDelivery(overrides: Partial<WebhookDeliveryRecord> = {}): WebhookDeliveryRecord {
  return {
    id: "delivery-1",
    workspaceId: "workspace-1",
    subscriptionId: "sub-1",
    eventId: "event-1",
    topic: "post.published",
    status: "pending",
    attempts: 0,
    nextAttemptAt: "2026-07-10T00:00:00.000Z",
    lastResponseStatus: null,
    lastError: null,
    signedWithVersion: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    deliveredAt: null,
    deadAt: null,
    ...overrides,
  };
}

test("findMatching matches exact topic, entity wildcard, and owner wildcard, but not other workspaces or inactive rows", async () => {
  const repo = new InMemoryWebhookSubscriptionRepo([
    makeSubscription({ id: "exact", topics: ["post.published"] }),
    makeSubscription({ id: "entity-wildcard", topics: ["post.*"] }),
    makeSubscription({ id: "owner-wildcard", topics: ["*"] }),
    makeSubscription({ id: "no-match", topics: ["comment.created"] }),
    makeSubscription({ id: "paused", topics: ["post.published"], status: "paused" }),
    makeSubscription({ id: "other-workspace", topics: ["post.published"], workspaceId: "workspace-2" }),
  ]);

  const matches = await repo.findMatching({ workspaceId: "workspace-1", topic: "post.published" });
  const ids = matches.map((m) => m.id).sort();

  assert.deepEqual(ids, ["entity-wildcard", "exact", "owner-wildcard"]);
  assert.deepEqual((await repo.findMatching({ workspaceId: "workspace-1", topic: "postage.created" })).map((row) => row.id), ["owner-wildcard"]);
});

test("findMatching treats an empty topic list as fail-closed (never matches)", async () => {
  const repo = new InMemoryWebhookSubscriptionRepo([makeSubscription({ id: "empty-topics", topics: [] })]);

  const matches = await repo.findMatching({ workspaceId: "workspace-1", topic: "post.published" });
  assert.deepEqual(matches, []);
});

test("claimPending only returns pending rows due at or before nowIso, and increments attempts", async () => {
  const repo = new InMemoryWebhookDeliveryRepo([
    makeDelivery({ id: "due", nextAttemptAt: "2026-07-10T00:00:00.000Z" }),
    makeDelivery({ id: "future", nextAttemptAt: "2026-07-11T00:00:00.000Z" }),
    makeDelivery({ id: "already-delivering", status: "delivering" }),
  ]);

  const claimed = await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T12:00:00.000Z" });

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, "due");
  assert.equal(claimed[0].attempts, 1);

  const stored = await repo.findById({ workspaceId: "workspace-1", id: "due" });
  assert.equal(stored?.status, "delivering");
  assert.equal(stored?.attempts, 1);
});

test("markFailed with nextStatus 'failed' re-enters pending; 'dead' stays terminal with deadAt set", async () => {
  const repo = new InMemoryWebhookDeliveryRepo([makeDelivery({ id: "d1" })]);
  await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:00:00.000Z" });

  await repo.markFailed({
    workspaceId: "workspace-1",
    id: "d1",
    error: "boom",
    responseStatus: 500,
    nextStatus: "failed",
    nextAttemptAt: "2026-07-10T00:05:00.000Z",
  });

  let row = await repo.findById({ workspaceId: "workspace-1", id: "d1" });
  assert.equal(row?.status, "pending");
  assert.equal(row?.lastError, "boom");
  assert.equal(row?.nextAttemptAt, "2026-07-10T00:05:00.000Z");
  assert.equal(row?.deadAt, null);

  await repo.markFailed({ workspaceId: "workspace-1", id: "d1", error: "still failing", responseStatus: 500, nextStatus: "dead", nextAttemptAt: "2026-07-10T00:05:00.000Z" }, { deadAtIso: "2026-07-10T00:05:00.000Z" });

  row = await repo.findById({ workspaceId: "workspace-1", id: "d1" });
  assert.equal(row?.status, "dead");
  assert.equal(row?.deadAt, "2026-07-10T00:05:00.000Z");
});

test("markDelivered clears lastError and stamps deliveredAt", async () => {
  const repo = new InMemoryWebhookDeliveryRepo([makeDelivery({ id: "d1", lastError: "previous failure" })]);

  await repo.markDelivered({
    workspaceId: "workspace-1",
    id: "d1",
    responseStatus: 204,
    deliveredAtIso: "2026-07-10T00:10:00.000Z",
  });

  const row = await repo.findById({ workspaceId: "workspace-1", id: "d1" });
  assert.equal(row?.status, "delivered");
  assert.equal(row?.lastError, null);
  assert.equal(row?.lastResponseStatus, 204);
  assert.equal(row?.deliveredAt, "2026-07-10T00:10:00.000Z");
});

test("InMemoryDeliveryEnvelopeStore round-trips save/find and returns null for unknown ids", async () => {
  const store = new InMemoryDeliveryEnvelopeStore();
  const envelope = {
    deliveryId: "delivery-1",
    eventId: "event-1",
    topic: "post.published",
    workspaceId: "workspace-1",
    occurredAt: "2026-07-10T00:00:00.000Z",
    data: { id: "post-1" },
  };

  await store.save({ deliveryId: "delivery-1", envelope });
  const found = await store.find({ deliveryId: "delivery-1" });
  assert.deepEqual(found, envelope);

  const missing = await store.find({ deliveryId: "unknown" });
  assert.equal(missing, null);
});

test("InMemoryWebhookSubscriptionRepo seeds initial rows, rejects a duplicate insert, and save overwrites in place", async () => {
  const seeded = makeSubscription();
  const repo = new InMemoryWebhookSubscriptionRepo([seeded]);

  assert.deepEqual(await repo.findById({ workspaceId: "workspace-1", id: "sub-1" }), seeded);
  assert.equal(await repo.findById({ workspaceId: "workspace-2", id: "sub-1" }), null);
  await assert.rejects(repo.insert(makeSubscription({ label: "Dup" })), /webhook subscription 'sub-1' already exists/);

  await repo.insert(makeSubscription({ workspaceId: "workspace-2" }));
  await repo.save(makeSubscription({ label: "Renamed" }));
  assert.equal((await repo.findById({ workspaceId: "workspace-1", id: "sub-1" }))?.label, "Renamed");
  assert.deepEqual((await repo.listByWorkspace({ workspaceId: "workspace-2" })).map((row) => row.workspaceId), ["workspace-2"]);
});

test("enqueue is idempotent per (workspace, subscription, event) and markDelivered/markFailed ignore unknown ids", async () => {
  const repo = new InMemoryWebhookDeliveryRepo([makeDelivery()]);

  await repo.enqueue({ record: makeDelivery({ id: "delivery-dup" }) });
  await repo.enqueue({ record: makeDelivery({ id: "delivery-2", eventId: "event-2" }) });
  await repo.markDelivered({ workspaceId: "workspace-1", id: "missing", responseStatus: 200, deliveredAtIso: "2026-07-10T00:00:01.000Z" });
  await repo.markFailed({ workspaceId: "workspace-1", id: "missing", error: "x", responseStatus: null, nextStatus: "dead", nextAttemptAt: "2026-07-10T00:00:01.000Z" });

  assert.equal(await repo.findById({ workspaceId: "workspace-1", id: "delivery-dup" }), null);
  assert.equal(await repo.findById({ workspaceId: "workspace-1", id: "missing" }), null);
  const listed = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 10 });
  assert.deepEqual(listed.map((row) => [row.id, row.status]), [["delivery-2", "pending"], ["delivery-1", "pending"]]);
});

test("markFailed 'dead' without deadAtIso keeps the row's existing deadAt", async () => {
  const repo = new InMemoryWebhookDeliveryRepo([makeDelivery({ deadAt: "2026-07-09T00:00:00.000Z" })]);

  await repo.markFailed({ workspaceId: "workspace-1", id: "delivery-1", error: "gone", responseStatus: 410, nextStatus: "dead", nextAttemptAt: "2026-07-11T00:00:00.000Z" });

  const row = await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" });
  assert.equal(row?.status, "dead");
  assert.equal(row?.deadAt, "2026-07-09T00:00:00.000Z");
  assert.equal(row?.lastError, "gone");
});

test("listBySubscription orders newest createdAt first, breaks ties by id descending, and honours limit", async () => {
  const repo = new InMemoryWebhookDeliveryRepo([
    makeDelivery({ id: "b", eventId: "e-b", createdAt: "2026-07-10T00:00:00.000Z" }),
    makeDelivery({ id: "a", eventId: "e-a", createdAt: "2026-07-10T00:00:00.000Z" }),
    makeDelivery({ id: "c", eventId: "e-c", createdAt: "2026-07-10T00:00:00.000Z" }),
    makeDelivery({ id: "new", eventId: "e-new", createdAt: "2026-07-11T00:00:00.000Z" }),
    makeDelivery({ id: "old", eventId: "e-old", createdAt: "2026-07-09T00:00:00.000Z" }),
    makeDelivery({ id: "other-sub", subscriptionId: "sub-2", eventId: "e-o" }),
    makeDelivery({ id: "other-ws", workspaceId: "workspace-2", eventId: "e-w" }),
  ]);

  const all = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 10 });
  assert.deepEqual(all.map((row) => row.id), ["new", "c", "b", "a", "old"]);
  const limited = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 2 });
  assert.deepEqual(limited.map((row) => row.id), ["new", "c"]);
});

test("claimPending returns due rows oldest nextAttemptAt first and caps them at batchSize", async () => {
  const repo = new InMemoryWebhookDeliveryRepo([
    makeDelivery({ id: "late", eventId: "e-late", nextAttemptAt: "2026-07-10T00:00:03.000Z" }),
    makeDelivery({ id: "early", eventId: "e-early", nextAttemptAt: "2026-07-10T00:00:01.000Z" }),
    makeDelivery({ id: "mid", eventId: "e-mid", nextAttemptAt: "2026-07-10T00:00:02.000Z" }),
  ]);

  const claimed = await repo.claimPending({ batchSize: 2, nowIso: "2026-07-10T00:00:05.000Z" });

  assert.deepEqual(claimed.map((row) => row.id), ["early", "mid"]);
  assert.equal((await repo.findById({ workspaceId: "workspace-1", id: "late" }))?.status, "pending");
});
