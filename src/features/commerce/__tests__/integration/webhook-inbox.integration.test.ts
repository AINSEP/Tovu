import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/db/sqlite/content-db";
import { commerceOrders, commerceWebhookEvents, members, workspaces } from "#src/db/schema";
import { SqliteCommerceWebhookEventRepo } from "../../repo.sqlite";
import { ingestProviderEvent } from "../../webhook-inbox";

/**
 * @file The debate's centerpiece deliverable (2026-08-12 swarm-consensus debate, section 5):
 * "idempotency AND ordering — they are different problems." Proves both against a real SQLite
 * transaction, not asserted in a design doc:
 *  - `(provider, eventId)` UNIQUE stops replay (a byte-identical redelivery, Stripe's own
 *    documented at-least-once behavior, must never re-apply).
 *  - The single atomic `UPDATE ... WHERE providerEventAt < ?` stops a genuinely new event that
 *    is nonetheless chronologically OLDER than what already landed from overwriting it — the
 *    case a naive `(provider, eventId)`-only guard would miss entirely.
 */

const T1 = "2026-08-12T12:00:00.000Z";
const T2 = "2026-08-12T12:05:00.000Z"; // later than T1
const T0 = "2026-08-12T11:55:00.000Z"; // earlier than T1 — arrives after T1 has already applied

function openTestDb(): ContentDb {
  return openContentDb(":memory:");
}

function seedOrder(db: ContentDb, id: string): void {
  db.insert(workspaces).values({ id: "ws-1", name: "ws-1", slug: "ws-1", createdAt: T0 }).onConflictDoNothing().run();
  db.insert(members)
    .values({ id: "member-1", workspaceId: "ws-1", email: "m@example.test", status: "active", createdAt: T0, updatedAt: T0, version: 1 })
    .onConflictDoNothing()
    .run();
  db.insert(commerceOrders)
    .values({
      id,
      workspaceId: "ws-1",
      memberId: "member-1",
      status: "pending",
      currency: "usd",
      totalAmountCents: 1000,
      provider: "stripe",
      placedAt: T0,
      createdAt: T0,
      updatedAt: T0,
      version: 1,
    })
    .run();
}

let idCounter = 0;
function makeDeps(db: ContentDb) {
  idCounter = 0;
  return {
    webhookEvents: new SqliteCommerceWebhookEventRepo(db),
    clock: { nowIso: () => "2026-08-12T13:00:00.000Z" },
    idGen: { newId: () => `evt-row-${++idCounter}` },
  };
}

test("ingestProviderEvent: applies the first delivery of an event", async () => {
  const db = openTestDb();
  seedOrder(db, "order-1");
  const deps = makeDeps(db);

  const result = await ingestProviderEvent({
    deps,
    event: { workspaceId: "ws-1", provider: "stripe", eventId: "evt_1", eventType: "payment_intent.succeeded", eventOccurredAt: T1, payload: '{"id":"evt_1"}' },
    projection: { orderId: "order-1", status: "paid" },
  });

  assert.equal(result, "applied");
  const order = db.select().from(commerceOrders).all()[0];
  assert.equal(order.status, "paid");
  assert.equal(order.providerEventAt, T1);
  assert.equal(order.version, 2);
});

test("ingestProviderEvent: a byte-identical replay of the same (provider, eventId) is ignored, even carrying a different projection", async () => {
  const db = openTestDb();
  seedOrder(db, "order-1");
  const deps = makeDeps(db);
  const event = { workspaceId: "ws-1", provider: "stripe", eventId: "evt_1", eventType: "payment_intent.succeeded", eventOccurredAt: T1, payload: '{"id":"evt_1"}' };

  const first = await ingestProviderEvent({ deps, event, projection: { orderId: "order-1", status: "paid" } });
  assert.equal(first, "applied");

  // Stripe redelivers at-least-once; the SAME event, but this time claiming a wildly different
  // outcome. It must not re-apply.
  const second = await ingestProviderEvent({ deps, event, projection: { orderId: "order-1", status: "canceled" } });
  assert.equal(second, "duplicate");

  const order = db.select().from(commerceOrders).all()[0];
  assert.equal(order.status, "paid", "the replay must never overwrite the already-applied state");
  assert.equal(order.version, 2, "a duplicate must not bump the optimistic-concurrency version either");
});

test("ingestProviderEvent: a chronologically-older event that arrives AFTER a newer one is ignored, even though it is a brand-new eventId", async () => {
  const db = openTestDb();
  seedOrder(db, "order-1");
  const deps = makeDeps(db);

  // The newer event (T1) arrives and applies first.
  const applied = await ingestProviderEvent({
    deps,
    event: { workspaceId: "ws-1", provider: "stripe", eventId: "evt_new", eventType: "payment_intent.succeeded", eventOccurredAt: T1, payload: "{}" },
    projection: { orderId: "order-1", status: "paid" },
  });
  assert.equal(applied, "applied");

  // A DIFFERENT, genuinely new event id, but its own timestamp (T0) is earlier than what's
  // already applied (T1) — out-of-order delivery, not a replay. A naive UNIQUE(provider,
  // eventId)-only guard would let this straight through.
  const stale = await ingestProviderEvent({
    deps,
    event: { workspaceId: "ws-1", provider: "stripe", eventId: "evt_old_but_late", eventType: "payment_intent.created", eventOccurredAt: T0, payload: "{}" },
    projection: { orderId: "order-1", status: "pending" },
  });
  assert.equal(stale, "stale");

  const order = db.select().from(commerceOrders).all()[0];
  assert.equal(order.status, "paid", "the out-of-order 'pending' must never overwrite the newer 'paid' state");
  assert.equal(order.providerEventAt, T1);
});

test("ingestProviderEvent: a later event correctly supersedes an earlier one applied first (normal in-order case)", async () => {
  const db = openTestDb();
  seedOrder(db, "order-1");
  const deps = makeDeps(db);

  const first = await ingestProviderEvent({
    deps,
    event: { workspaceId: "ws-1", provider: "stripe", eventId: "evt_a", eventType: "payment_intent.created", eventOccurredAt: T0, payload: "{}" },
    projection: { orderId: "order-1", status: "pending" },
  });
  assert.equal(first, "applied");

  const second = await ingestProviderEvent({
    deps,
    event: { workspaceId: "ws-1", provider: "stripe", eventId: "evt_b", eventType: "payment_intent.succeeded", eventOccurredAt: T2, payload: "{}" },
    projection: { orderId: "order-1", status: "paid" },
  });
  assert.equal(second, "applied");

  const order = db.select().from(commerceOrders).all()[0];
  assert.equal(order.status, "paid");
  assert.equal(order.providerEventAt, T2);
});

test("ingestProviderEvent: the raw provider payload round-trips verbatim through the inbox for audit", async () => {
  const db = openTestDb();
  seedOrder(db, "order-1");
  const deps = makeDeps(db);

  await ingestProviderEvent({
    deps,
    event: { workspaceId: "ws-1", provider: "stripe", eventId: "evt_1", eventType: "payment_intent.succeeded", eventOccurredAt: T1, payload: '{"amount":1000,"nested":{"ok":true}}' },
    projection: { orderId: "order-1", status: "paid" },
  });

  const inboxRow = db.select().from(commerceWebhookEvents).all()[0];
  assert.equal(inboxRow.payloadJson, '{"amount":1000,"nested":{"ok":true}}');
  assert.equal(inboxRow.status, "applied");
});
