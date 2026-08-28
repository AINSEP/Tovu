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

  await repo.markFailed({
    workspaceId: "workspace-1",
    id: "d1",
    error: "still failing",
    responseStatus: 500,
    nextStatus: "dead",
    nextAttemptAt: "2026-07-10T00:05:00.000Z",
    deadAtIso: "2026-07-10T00:05:00.000Z",
  });

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
