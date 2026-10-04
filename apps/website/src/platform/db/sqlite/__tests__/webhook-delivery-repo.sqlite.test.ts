import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "../content-db.js";
import { InMemoryDeliveryEnvelopeStore, InMemoryWebhookDeliveryRepo } from "#src/features/webhooks/repo.memory";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { webhookDeliveryRepoFor } from "#src/platform/db/repos/webhook-repo";
import { SqliteWebhookDeliveryRepo } from "../webhook-repo.sqlite.js";
import type { DeliveryEnvelopeStore } from "#src/features/webhooks/repo.memory";
import type { WebhookDeliveryRepoPort } from "#src/features/webhooks/ports";
import type { WebhookDeliveryRecord, WebhookEventEnvelope } from "#src/features/webhooks/types";

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
    await repo.enqueue(makeDelivery({ id: "delivery-duplicate" }));

    const rows = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 10 });
    assert.equal(rows.length, 1);
    assert.deepEqual(rows, [makeDelivery()]);
    assert.equal(await repo.findById({ workspaceId: "workspace-1", id: "delivery-duplicate" }), null);
  });

  test(`[${adapterName}] claimPending claims due rows, sets delivering, and increments attempts`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    const future = makeDelivery({ id: "delivery-future", eventId: "event-future", nextAttemptAt: "2099-01-01T00:00:00.000Z" });
    await repo.enqueue(future);
    assert.deepEqual(await repo.findById({ workspaceId: "workspace-1", id: future.id }), future);
    assert.ok(await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" }));
    for (const status of ["delivering", "delivered", "dead"] as const) {
      await repo.enqueue(makeDelivery({ id: `delivery-${status}`, eventId: `event-${status}`, status }));
    }

    const claimed = await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:00:01.000Z" });
    assert.deepEqual(
      claimed.map((r) => r.id),
      ["delivery-1"]
    );
    assert.equal(claimed[0].status, "delivering");
    assert.equal(claimed[0].attempts, 1);
    assert.deepEqual(await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" }), makeDelivery({ status: "delivering", attempts: 1 }));
    assert.deepEqual(await repo.findById({ workspaceId: "workspace-1", id: future.id }), future);
    assert.deepEqual(await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:00:01.000Z" }), []);
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

  test(`[${adapterName}] claimPending respects batchSize and leaves the rest claimable`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    await repo.enqueue(makeDelivery({ id: "delivery-2", eventId: "event-2", nextAttemptAt: "2026-07-10T00:00:01.000Z" }));
    const input = { batchSize: 1, nowIso: "2026-07-10T00:00:02.000Z" };
    assert.deepEqual((await repo.claimPending(input)).map((row) => row.id), ["delivery-1"]);
    assert.deepEqual((await repo.claimPending(input)).map((row) => row.id), ["delivery-2"]);
    assert.deepEqual(await repo.claimPending(input), []);
  });

  test(`[${adapterName}] markDelivered and markFailed refuse another workspace's row`, async () => {
    const repo = makeRepo();
    await repo.enqueue(makeDelivery());
    await repo.markDelivered({ workspaceId: "workspace-2", id: "delivery-1", responseStatus: 200, deliveredAtIso: "2026-07-10T00:05:00.000Z" });
    assert.deepEqual(await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" }), makeDelivery());
    await repo.markFailed({ workspaceId: "workspace-2", id: "delivery-1", error: "wrong workspace", responseStatus: 500, nextStatus: "dead", nextAttemptAt: "2026-07-10T00:10:00.000Z", deadAtIso: "2026-07-10T00:11:00.000Z" });
    assert.deepEqual(await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" }), makeDelivery());
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
    assert.equal(found?.lastResponseStatus, null);
    assert.equal(found?.nextAttemptAt, "2026-07-10T00:10:00.000Z");
    assert.deepEqual(await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:09:59.999Z" }), []);
    assert.deepEqual((await repo.claimPending({ batchSize: 10, nowIso: "2026-07-10T00:10:00.000Z" })).map((row) => row.id), ["delivery-1"]);

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
    assert.equal(found?.lastResponseStatus, 500);
    assert.equal(found?.nextAttemptAt, "2026-07-10T00:10:00.000Z");
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
    await repo.enqueue(makeDelivery({ id: "d-2", eventId: "event-other" }));
    await repo.enqueue(makeDelivery({ id: "d-3", subscriptionId: "sub-2", eventId: "event-2" }));
    await repo.enqueue(makeDelivery({ id: "d-4", workspaceId: "workspace-2", eventId: "event-3" }));

    const all = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 10 });
    assert.deepEqual(all.map((row) => row.id).sort(), ["d-1", "d-2"]);

    const rows = await repo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 1 });
    assert.equal(rows.length, 1);
    assert.ok(["d-1", "d-2"].includes(rows[0]!.id));
  });

  test(`[${adapterName}] listBySubscription orders newest-first with descending id ties before limiting`, async () => {
    const repo = makeRepo();
    const oldest = makeDelivery({ id: "d-oldest", eventId: "event-oldest" });
    const middle = makeDelivery({ id: "d-middle", eventId: "event-middle", createdAt: "2026-07-10T01:00:00.000Z" });
    const tiedA = makeDelivery({ id: "d-tied-a", eventId: "event-tied-a", createdAt: "2026-07-10T02:00:00.000Z" });
    const tiedB = makeDelivery({ id: "d-tied-b", eventId: "event-tied-b", createdAt: tiedA.createdAt });
    // Older and equal-time rows arrive in the opposite order to the requested page. Sorting
    // the already-limited result cannot fix either mistake (F1761).
    for (const row of [oldest, tiedA,
      makeDelivery({ id: "d-other-workspace", workspaceId: "workspace-2", createdAt: "2026-07-10T03:00:00.000Z" }),
      makeDelivery({ id: "d-other-subscription", subscriptionId: "sub-2", createdAt: "2026-07-10T03:00:00.000Z" }),
      tiedB, middle]) {
      await repo.enqueue(row);
    }
    const required = { workspaceId: "workspace-1", subscriptionId: "sub-1" };
    assert.deepEqual(await repo.listBySubscription({ ...required, limit: 1 }), [tiedB]);
    assert.deepEqual(await repo.listBySubscription({ ...required, limit: 2 }), [tiedB, tiedA]);
    assert.deepEqual(await repo.listBySubscription({ ...required, limit: 10 }), [tiedB, tiedA, middle, oldest]);
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
  const dir = mkdtempSync(join(tmpdir(), "tovu-deliveries-restart-"));
  const dbPath = join(dir, "content.db");
  try {
    const writer = openContentDb(dbPath);
    try {
      const first = new SqliteWebhookDeliveryRepo(writer);
      await first.enqueue(makeDelivery());
      await first.save({ deliveryId: "delivery-1", envelope: makeEnvelope() });
    } finally { writer.$client.close(); }
    const reader = openContentDb(dbPath);
    try {
      const rehydrated = new SqliteWebhookDeliveryRepo(reader);
      assert.deepEqual(await rehydrated.findById({ workspaceId: "workspace-1", id: "delivery-1" }), makeDelivery());
      assert.deepEqual(await rehydrated.find({ deliveryId: "delivery-1" }), makeEnvelope());
    } finally { reader.$client.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/**
 * `enqueue` is `ON CONFLICT DO NOTHING` over every unique index: colliding on `id` alone (same id,
 * different workspace/subscription/event) trips the PRIMARY KEY, not the compound UNIQUE index the
 * contract-suite idempotency test uses, and must be a silent no-op too.
 */
test("SqliteWebhookDeliveryRepo.enqueue: a colliding id (PRIMARY KEY, not the unique index) is also a silent no-op", async () => {
  const db = openContentDb(":memory:");
  const repo = new SqliteWebhookDeliveryRepo(db);
  await repo.enqueue(makeDelivery());

  // Same id as the row above, but a different (workspaceId, subscriptionId, eventId) — this trips
  // the PRIMARY KEY index, not the compound UNIQUE index the contract-suite idempotency test uses.
  await repo.enqueue(makeDelivery({ subscriptionId: "sub-2", eventId: "event-2" }));

  const found = await repo.findById({ workspaceId: "workspace-1", id: "delivery-1" });
  assert.deepEqual(found, makeDelivery(), "the original row must be untouched -- the colliding insert must not have partially applied");
});

/** The other side: a constraint failure that is NOT a uniqueness violation at all (here, a NOT
 *  NULL failure on `topic`) must propagate, not be swallowed as "already enqueued". */
test("SqliteWebhookDeliveryRepo.enqueue: a non-uniqueness constraint violation (NOT NULL) is rethrown, not swallowed", async () => {
  const db = openContentDb(":memory:");
  const repo = new SqliteWebhookDeliveryRepo(db);

  // `topic` is `NOT NULL` in the schema; `WebhookTopic` itself disallows null, so this cast is the
  // only way to construct the malformed record this test needs to reach the real SQLite driver.
  const malformed = { ...makeDelivery(), topic: null } as unknown as WebhookDeliveryRecord;

  await assert.rejects(
    () => repo.enqueue(malformed),
    { message: "NOT NULL constraint failed: webhook_deliveries.topic" }
  );
});

// The one Kysely body on every dialect (storage plan §4): SQLite again through the neutral factory, and PGlite.
for (const each of eachDialect({ tables: ["webhook_deliveries"], make: webhookDeliveryRepoFor })) {
  runContractSuite(`kysely/${each.name}`, each.make);
}
