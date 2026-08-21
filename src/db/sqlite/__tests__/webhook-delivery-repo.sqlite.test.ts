import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../content-db.js";
import { InMemoryDeliveryEnvelopeStore, InMemoryWebhookDeliveryRepo } from "../../../webhooks/repo.memory.js";
import { SqliteWebhookDeliveryRepo } from "../webhook-repo.sqlite.js";
import type { DeliveryEnvelopeStore } from "../../../webhooks/repo.memory.js";
import type { WebhookDeliveryRepoPort } from "../../../webhooks/ports.js";
import type { WebhookDeliveryRecord, WebhookEventEnvelope } from "../../../webhooks/types.js";

/**
 * @file Shared `WebhookDeliveryRepoPort` contract-test suite (ADR-PIPE-015 Phase 2 T021), incl.
 * the `payload_json` round-trip (GAP-12) and a restart-simulated fresh-repo-instance read —
 * proving `SqliteWebhookDeliveryRepo` persists across process boundaries, unlike the in-memory
 * adapter (whose "restart" test is necessarily a same-process no-op, included for parity only).
 * Relocated from `integrations/__tests__/repo.delivery.contract.test.ts` (2026-08-17,
 * architecture SCC cut) alongside the adapter it exercises.
 */

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

function makeEnvelope(overrides: Partial<WebhookEventEnvelope> = {}): WebhookEventEnvelope {
  return {
    deliveryId: "delivery-1",
    eventId: "event-1",
    topic: "post.published",
    workspaceId: "workspace-1",
    occurredAt: "2026-07-10T00:00:00.000Z",
    data: { entryId: "post-1", nested: { ok: true, count: 3 } },
    ...overrides,
  };
}

function runContractSuite(
  adapterName: string,
  makeRepo: () => WebhookDeliveryRepoPort & DeliveryEnvelopeStore
) {
  test(`[${adapterName}] enqueue + findById round-trips`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    const found = await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" });
    assert.deepEqual(found, makeDelivery());
  });

  test(`[${adapterName}] enqueue is idempotent on (workspace_id, subscription_id, event_id)`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    // A second enqueue for the same (workspace, subscription, event) must not throw or duplicate.
    await repo.enqueue(makeDelivery({ id: "delivery-1" }));

    const rows = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 10 });
    assert.equal(rows.length, 1);
  });

  test(`[${adapterName}] claimPending claims due rows, sets delivering, and increments attempts`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    await repo.enqueue(makeDelivery({ id: "delivery-future", nextAttemptAt: "2099-01-01T00:00:00.000Z" }));

    const claimed = await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:00:01.000Z" });
    assert.deepEqual(
      claimed.map((r) => r.id),
      ["delivery-1"]
    );
    assert.equal(claimed[0].status, "delivering");
    assert.equal(claimed[0].attempts, 1);
  });

  test(`[${adapterName}] claimPending orders multiple due rows oldest-nextAttemptAt-first`, async () => {
    const repo = makeRepo();
    await repo.enqueue(
      makeDelivery({
        id: "delivery-newer",
        eventId: "event-newer",
        nextAttemptAt: "2026-07-10T00:00:03.000Z",
      })
    );
    await repo.enqueue(
      makeDelivery({
        id: "delivery-oldest",
        eventId: "event-oldest",
        nextAttemptAt: "2026-07-10T00:00:01.000Z",
      })
    );
    await repo.enqueue(
      makeDelivery({
        id: "delivery-middle",
        eventId: "event-middle",
        nextAttemptAt: "2026-07-10T00:00:02.000Z",
      })
    );

    const claimed = await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:00:05.000Z" });

    assert.deepEqual(
      claimed.map((r) => r.id),
      ["delivery-oldest", "delivery-middle", "delivery-newer"],
      "rows must come back sorted by nextAttemptAt ascending regardless of insertion order"
    );
  });

  test(`[${adapterName}] markDelivered clears lastError and stamps deliveredAt`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery({ lastError: "prior failure" }));
    await repo.markDelivered({
      workspaceId: "workspace-1",
      id: "delivery-1",
      responseStatus: 200,
      deliveredAtIso: "2026-07-10T00:05:00.000Z",
    });

    const found = await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" });
    assert.equal(found?.status, "delivered");
    assert.equal(found?.lastResponseStatus, 200);
    assert.equal(found?.deliveredAt, "2026-07-10T00:05:00.000Z");
    assert.equal(found?.lastError, null);
  });

  test(`[${adapterName}] markFailed re-enters pending, or dead when nextStatus is dead`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());

    await repo.markFailed({
      workspaceId: "workspace-1",
      id: "delivery-1",
      error: "timeout",
      responseStatus: null,
      nextStatus: "failed",
      nextAttemptAt: "2026-07-10T00:10:00.000Z",
    });
    let found = await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" });
    assert.equal(found?.status, "pending");
    assert.equal(found?.lastError, "timeout");

    await repo.markFailed({
      workspaceId: "workspace-1",
      id: "delivery-1",
      error: "exhausted",
      responseStatus: 500,
      nextStatus: "dead",
      nextAttemptAt: "2026-07-10T00:10:00.000Z",
      deadAtIso: "2026-07-10T00:11:00.000Z",
    });
    found = await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" });
    assert.equal(found?.status, "dead");
    assert.equal(found?.deadAt, "2026-07-10T00:11:00.000Z");
  });

  test(`[${adapterName}] markFailed on a non-existent row is a silent no-op`, async () => {
    const repo = makeRepo();

    // Must not throw, and must not create a row -- nothing was enqueued for this id.
    await repo.markFailed({
      workspaceId: "workspace-1",
      id: "does-not-exist",
      error: "timeout",
      responseStatus: null,
      nextStatus: "failed",
      nextAttemptAt: "2026-07-10T00:10:00.000Z",
    });

    assert.equal(await repo.findById({ workspaceId: "workspace-1", id: "does-not-exist" }), null);
  });

  test(`[${adapterName}] marking dead WITHOUT deadAtIso keeps the row's existing deadAt rather than clearing it`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());

    // First: mark dead WITH deadAtIso, so the row has a real deadAt to test the fallback against.
    await repo.markFailed({
      workspaceId: "workspace-1",
      id: "delivery-1",
      error: "first failure",
      responseStatus: 500,
      nextStatus: "dead",
      nextAttemptAt: "2026-07-10T00:10:00.000Z",
      deadAtIso: "2026-07-10T00:11:00.000Z",
    });

    // Second: mark dead again, this time WITHOUT deadAtIso -- must fall back to the existing deadAt,
    // not overwrite it with undefined/null.
    await repo.markFailed({
      workspaceId: "workspace-1",
      id: "delivery-1",
      error: "second failure",
      responseStatus: 500,
      nextStatus: "dead",
      nextAttemptAt: "2026-07-10T00:20:00.000Z",
    });

    const found = await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" });
    assert.equal(found?.status, "dead");
    assert.equal(found?.deadAt, "2026-07-10T00:11:00.000Z", "deadAt must carry over from the first mark-dead");
    assert.equal(found?.lastError, "second failure");
  });

  test(`[${adapterName}] listBySubscription scopes by workspace + subscription and respects limit`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery({ id: "d-1" }));
    await repo.enqueue(makeDelivery({ id: "d-2" }));
    await repo.enqueue(makeDelivery({ id: "d-3", subscriptionId: "sub-2", eventId: "event-2" }));

    const rows = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 1 });
    assert.equal(rows.length, 1);
  });

  test(`[${adapterName}] payload_json round-trip: enqueue -> save -> claim -> findById byte-identical envelope (INV-P4)`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    await repo.save({ deliveryId: "delivery-1", envelope: makeEnvelope() });

    await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:00:01.000Z" });

    const envelope = await repo.find({ deliveryId: "delivery-1" });
    assert.deepEqual(envelope, makeEnvelope());
  });

  test(`[${adapterName}] find returns null when no envelope was ever saved`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    assert.equal(await repo.find({ deliveryId: "delivery-1" }), null);
  });
}

runContractSuite("InMemory", () => {
  const deliveryRepo = new InMemoryWebhookDeliveryRepo();
  const envelopeStore = new InMemoryDeliveryEnvelopeStore();
  return Object.assign(deliveryRepo, {
    save: envelopeStore.save.bind(envelopeStore),
    find: envelopeStore.find.bind(envelopeStore),
  });
});

runContractSuite("SqliteWebhookDeliveryRepo", () => new SqliteWebhookDeliveryRepo(openContentDb(":memory:")));

test("ADR-046 fold-in item 5 (GAP-05/GAP-12): SqliteWebhookDeliveryRepo.enqueue()'s optional envelope argument is durably readable BEFORE any separate save() call ever runs", async () => {
  const db = openContentDb(":memory:");
  const repo = new SqliteWebhookDeliveryRepo(db);

  // The envelope rides into enqueue() itself — save() is never called in this test at all. If
  // this were the old two-step design (enqueue() always leaves payload_json NULL, only save()
  // fills it in), find() would return null here.
  await repo.enqueue(makeDelivery(), makeEnvelope());

  const envelope = await repo.find({ deliveryId: "delivery-1" });
  assert.deepEqual(envelope, makeEnvelope(), "the envelope must be durably present immediately after enqueue(), with no separate write required");
});

test("SqliteWebhookDeliveryRepo: a fresh repo instance against the same underlying db reads persisted rows (restart simulation)", async () => {
  const db = openContentDb(":memory:");
  const first = new SqliteWebhookDeliveryRepo(db);
  await first.enqueue(makeDelivery());
  await first.save({ deliveryId: "delivery-1", envelope: makeEnvelope() });

  // Simulates a process restart: a brand-new repo instance, same db handle (in real use, the
  // same on-disk content.db file reopened).
  const rehydrated = new SqliteWebhookDeliveryRepo(db);
  const found = await rehydrated.findById({ workspaceId: "workspace-1", id: "delivery-1" });
  assert.deepEqual(found, makeDelivery());
  const envelope = await rehydrated.find({ deliveryId: "delivery-1" });
  assert.deepEqual(envelope, makeEnvelope());
});
