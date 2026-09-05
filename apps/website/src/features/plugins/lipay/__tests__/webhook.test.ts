/**
 * @file Inbound webhooks: real HMAC verification over real bytes, and the idempotency and ordering
 * guarantees core enforces on the provider's behalf.
 *
 * Every signature in this file is produced by the same HMAC the gateway verifies with — nothing is
 * stubbed. A test that mocks signature verification does not test signature verification.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import { InMemoryPaymentCredentials } from "../credentials.js";
import { signLipayWebhook } from "../providers/lipay-gateway.js";
import { chargeOk, cleanup, makeLipay, WEBHOOK_SECRET, WORKSPACE_ID, type Harness } from "./support.js";

const USD = (minorUnits: number) => ({ minorUnits, currency: "USD" });

function delivery(
  event: { id: string; type: string; createdSeconds: number; charge: { id: string; amount?: number; currency?: string } },
  optional: { secret?: string; signedAtSeconds?: number } = {}
): { rawBody: Buffer; headers: Record<string, string> } {
  const rawBody = Buffer.from(
    JSON.stringify({
      id: event.id,
      type: event.type,
      created: event.createdSeconds,
      data: event.charge,
    }),
    "utf8"
  );
  const signature = signLipayWebhook({
    secret: optional.secret ?? WEBHOOK_SECRET,
    rawBody,
    timestampSeconds: optional.signedAtSeconds ?? event.createdSeconds,
  });
  return { rawBody, headers: { "content-type": "application/json", "x-lipay-signature": signature } };
}

async function pendingPayment(harness: Harness, minorUnits = 1000) {
  const created = await harness.api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(minorUnits),
    idempotencyKey: "order-1",
  });
  if (!created.ok) throw new Error("charge fixture failed");
  return created.payment;
}

const eventRows = (db: import("better-sqlite3").Database) =>
  db.prepare(`SELECT * FROM "p_lipay__events" ORDER BY received_at, id`).all() as {
    provider_event_id: string;
    payment_id: string | null;
    kind: string;
    applied: number;
    payload: string;
  }[];

test("webhook: a genuinely signed delivery verifies and advances the payment to succeeded", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });

  assert.deepEqual(ack, { accepted: true, processed: 1, duplicates: 0 });
  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "succeeded");

  const rows = eventRows(harness.db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].applied, 1);
  assert.equal(rows[0].payment_id, payment.id);
  // The raw body is retained verbatim as the audit record of what the provider actually sent.
  assert.equal(JSON.parse(rows[0].payload).id, "evt_1");

  cleanup(harness.db, harness.dir);
});

test("webhook: a tampered body fails verification and changes nothing", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  const signed = delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } });
  // Same signature, different bytes — exactly what a parse-then-reserialize round trip, or an
  // attacker replaying a captured signature over an edited payload, would produce.
  const tampered = Buffer.from(signed.rawBody.toString("utf8").replace('"charge.succeeded"', '"charge.failed"'), "utf8");
  assert.notEqual(tampered.toString("utf8"), signed.rawBody.toString("utf8"));

  const ack = await harness.api.handleWebhook({ providerId: "lipay", rawBody: tampered, headers: signed.headers });

  assert.equal(ack.accepted, false);
  assert.equal(ack.error?.code, "SIGNATURE_INVALID");
  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "pending");
  assert.equal(eventRows(harness.db).length, 0, "an unverified delivery is never recorded");

  cleanup(harness.db, harness.dir);
});

test("webhook: a signature made with the wrong secret is rejected", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery(
      { id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } },
      { secret: "whsec_attacker" }
    ),
  });

  assert.equal(ack.error?.code, "SIGNATURE_INVALID");

  cleanup(harness.db, harness.dir);
});

test("webhook: a missing or malformed signature header is rejected", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const signed = delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: 1, charge: { id: "ch_1" } });

  for (const headers of [
    {},
    { "x-lipay-signature": "garbage" },
    { "x-lipay-signature": "t=abc,v1=zz" },
    // A well-formed `key=value` pair whose key is neither `t` nor `v1` — distinct from `garbage`
    // (no `=` at all) and from `t=abc`/`v1=zz` (recognized key, malformed value): this exercises
    // parseSignaturePart's final "names neither" fallback.
    { "x-lipay-signature": "foo=bar" },
  ]) {
    const ack = await harness.api.handleWebhook({ providerId: "lipay", rawBody: signed.rawBody, headers });
    assert.equal(ack.error?.code, "SIGNATURE_INVALID");
  }

  cleanup(harness.db, harness.dir);
});

test("webhook: a validly signed but stale timestamp is refused, so a captured body cannot be replayed forever", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const staleSeconds = Math.floor(harness.clock.now() / 1000) - 3600;

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: staleSeconds, charge: { id: "ch_1" } }),
  });

  assert.equal(ack.error?.code, "SIGNATURE_INVALID");
  assert.match(ack.error?.message ?? "", /outside the accepted window/);

  cleanup(harness.db, harness.dir);
});

test("webhook: the signature covers the timestamp too — moving t invalidates it", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  const signed = delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } });
  const mac = signed.headers["x-lipay-signature"].split("v1=")[1];
  const shifted = { ...signed.headers, "x-lipay-signature": `t=${nowSeconds - 1},v1=${mac}` };

  const ack = await harness.api.handleWebhook({ providerId: "lipay", rawBody: signed.rawBody, headers: shifted });
  assert.equal(ack.error?.code, "SIGNATURE_INVALID");

  cleanup(harness.db, harness.dir);
});

test("webhook: a redelivered event is a database constraint hit, not a code branch — no double apply", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness, 1000);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  const refund = delivery({
    id: "evt_refund_1",
    type: "charge.refunded",
    createdSeconds: nowSeconds,
    charge: { id: "ch_1", amount: 400, currency: "USD" },
  });

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });

  const first = await harness.api.handleWebhook({ providerId: "lipay", ...refund });
  const second = await harness.api.handleWebhook({ providerId: "lipay", ...refund });
  const third = await harness.api.handleWebhook({ providerId: "lipay", ...refund });

  assert.deepEqual(first, { accepted: true, processed: 1, duplicates: 0 });
  assert.deepEqual(second, { accepted: true, processed: 0, duplicates: 1 });
  assert.deepEqual(third, { accepted: true, processed: 0, duplicates: 1 });

  // The failure this prevents: an incrementing refund total applied once per redelivery.
  const after = harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id });
  assert.equal(after?.amountRefundedMinor, 400);
  assert.equal(after?.status, "partially_refunded");
  assert.equal(eventRows(harness.db).filter((r) => r.provider_event_id === "evt_refund_1").length, 1);

  cleanup(harness.db, harness.dir);
});

test("webhook: distinct refund events accumulate, and the total is capped at the payment amount", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness, 1000);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({
      id: "evt_2",
      type: "charge.refunded",
      createdSeconds: nowSeconds + 1,
      charge: { id: "ch_1", amount: 600, currency: "USD" },
    }),
  });
  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({
      id: "evt_3",
      type: "charge.refunded",
      createdSeconds: nowSeconds + 2,
      charge: { id: "ch_1", amount: 900, currency: "USD" },
    }),
  });

  const after = harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id });
  assert.equal(after?.amountRefundedMinor, 1000, "the refunded total never exceeds the payment");
  assert.equal(after?.status, "refunded");

  cleanup(harness.db, harness.dir);
});

test("webhook: a refund event that omits an amount is treated as a full refund of the payment", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness, 1000);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    // No `amount`/`currency` on the charge — the shape a provider sends when it doesn't itemize a
    // full refund, relying on the receiver to infer "the whole payment" from the absence.
    ...delivery({ id: "evt_2", type: "charge.refunded", createdSeconds: nowSeconds + 1, charge: { id: "ch_1" } }),
  });

  assert.deepEqual(ack, { accepted: true, processed: 1, duplicates: 0 });
  const after = harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id });
  assert.equal(after?.amountRefundedMinor, 1000, "an amount-less refund event infers the full charge amount");
  assert.equal(after?.status, "refunded");

  cleanup(harness.db, harness.dir);
});

test("webhook: an event older than the last applied one is recorded but never applied", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_2", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  // A `charge.failed` that was emitted BEFORE the success but delivered after it.
  const late = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery(
      { id: "evt_1", type: "charge.failed", createdSeconds: nowSeconds - 30, charge: { id: "ch_1" } },
      { signedAtSeconds: nowSeconds }
    ),
  });

  assert.equal(late.accepted, true);
  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "succeeded");
  const stale = eventRows(harness.db).find((r) => r.provider_event_id === "evt_1");
  assert.equal(stale?.applied, 0, "the out-of-order event is kept for the audit trail, unapplied");

  cleanup(harness.db, harness.dir);
});

test("webhook: a terminal payment rejects further transitions", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.failed", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "failed");

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_2", type: "charge.succeeded", createdSeconds: nowSeconds + 60, charge: { id: "ch_1" } }),
  });

  assert.equal(
    harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status,
    "failed",
    "a failed payment must not be resurrected by a later success event"
  );
  assert.equal(eventRows(harness.db).find((r) => r.provider_event_id === "evt_2")?.applied, 0);

  cleanup(harness.db, harness.dir);
});

test("webhook: an expired out-of-band charge is canceled", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.expired", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });

  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "canceled");

  cleanup(harness.db, harness.dir);
});

test("webhook: a chargeback is recorded without a status claim, since no status expresses it", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_2", type: "charge.chargeback", createdSeconds: nowSeconds + 1, charge: { id: "ch_1" } }),
  });

  assert.equal(ack.accepted, true);
  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "succeeded");
  assert.equal(eventRows(harness.db).find((r) => r.provider_event_id === "evt_2")?.kind, "chargeback");

  cleanup(harness.db, harness.dir);
});

test("webhook: an unrecognized event type is accepted with a 2xx rather than provoking a retry storm", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "payout.settled", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });

  assert.deepEqual(ack, { accepted: true, processed: 0, duplicates: 0 });
  assert.equal(eventRows(harness.db).length, 0);

  cleanup(harness.db, harness.dir);
});

test("webhook: an event for an unknown charge is recorded uncorrelated, not dropped", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_unknown" } }),
  });

  assert.equal(ack.accepted, true);
  const row = eventRows(harness.db)[0];
  assert.equal(row.payment_id, null);
  assert.equal(row.applied, 0);

  cleanup(harness.db, harness.dir);
});

test("webhook: an unregistered providerId is a typed PROVIDER_NOT_REGISTERED", async () => {
  const harness = await makeLipay();
  const ack = await harness.api.handleWebhook({ providerId: "stripe", rawBody: Buffer.from("{}"), headers: {} });

  assert.equal(ack.accepted, false);
  assert.equal(ack.error?.code, "PROVIDER_NOT_REGISTERED");

  cleanup(harness.db, harness.dir);
});

test("webhook: an unconfigured provider is refused before any verification is attempted", async () => {
  const harness = await makeLipay({ credentials: new InMemoryPaymentCredentials() });
  const ack = await harness.api.handleWebhook({ providerId: "lipay", rawBody: Buffer.from("{}"), headers: {} });

  assert.equal(ack.accepted, false);
  assert.equal(ack.error?.code, "NO_CREDENTIALS_CONFIGURED");

  cleanup(harness.db, harness.dir);
});

// The tests below target the gateway's own signature and body parsing directly — every remaining
// branch `verifySignature`/`parseWebhook`/`buildWebhookResult`/`resolveChargeAmount` can take.

test("webhook: a signature header sent in uppercase is still recognized", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  const signed = delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } });

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    rawBody: signed.rawBody,
    headers: { "X-LIPAY-SIGNATURE": signed.headers["x-lipay-signature"] },
  });

  assert.deepEqual(ack, { accepted: true, processed: 1, duplicates: 0 });
  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "succeeded");

  cleanup(harness.db, harness.dir);
});

test("webhook: a well-formed but wrong-length signature value is rejected, never compared byte-for-byte", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  const signed = delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } });

  // "ab" is valid hex (passes the /^[0-9a-f]+$/i shape check) but decodes to 1 byte, never the 32
  // bytes a real SHA-256 HMAC produces — `timingSafeEqual` would throw on this if length weren't
  // checked first.
  const shortened = { ...signed.headers, "x-lipay-signature": `t=${nowSeconds},v1=ab` };
  const ack = await harness.api.handleWebhook({ providerId: "lipay", rawBody: signed.rawBody, headers: shortened });

  assert.equal(ack.error?.code, "SIGNATURE_INVALID");

  cleanup(harness.db, harness.dir);
});

test("webhook: a validly signed body that isn't valid JSON fails closed rather than crashing", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  const rawBody = Buffer.from("not json at all", "utf8");
  const signature = signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody, timestampSeconds: nowSeconds });

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    rawBody,
    headers: { "x-lipay-signature": signature },
  });

  assert.equal(ack.accepted, false);
  assert.equal(ack.error?.code, "PROVIDER_ERROR");
  assert.match(ack.error?.message ?? "", /not a recognizable event/);

  cleanup(harness.db, harness.dir);
});

test("webhook: a validly signed body missing its type field is rejected as unrecognizable", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  const rawBody = Buffer.from(JSON.stringify({ id: "evt_1", data: { id: "ch_1" } }), "utf8");
  const signature = signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody, timestampSeconds: nowSeconds });

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    rawBody,
    headers: { "x-lipay-signature": signature },
  });

  assert.equal(ack.error?.code, "PROVIDER_ERROR");
  assert.match(ack.error?.message ?? "", /not a recognizable event/);

  cleanup(harness.db, harness.dir);
});

test("webhook: a validly signed body missing its id field is rejected as unrecognizable", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  const rawBody = Buffer.from(JSON.stringify({ type: "charge.succeeded", data: { id: "ch_1" } }), "utf8");
  const signature = signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody, timestampSeconds: nowSeconds });

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    rawBody,
    headers: { "x-lipay-signature": signature },
  });

  assert.equal(ack.error?.code, "PROVIDER_ERROR");
  assert.match(ack.error?.message ?? "", /not a recognizable event/);

  cleanup(harness.db, harness.dir);
});

test("webhook: a refund event whose amount is not a safe integer is treated as a full refund, the field ignored", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness, 1000);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({
      id: "evt_2",
      type: "charge.refunded",
      createdSeconds: nowSeconds + 1,
      charge: { id: "ch_1", amount: 400.5, currency: "USD" },
    }),
  });

  assert.deepEqual(ack, { accepted: true, processed: 1, duplicates: 0 });
  const after = harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id });
  assert.equal(after?.amountRefundedMinor, 1000, "a non-integer amount is not usable money, so the full charge is inferred");
  assert.equal(after?.status, "refunded");

  cleanup(harness.db, harness.dir);
});

test("webhook: a refund event whose currency is not a string is treated as a full refund, the field ignored", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness, 1000);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({
      id: "evt_2",
      type: "charge.refunded",
      createdSeconds: nowSeconds + 1,
      // `currency` is numeric here, an intentionally malformed shape a strict-string check must reject.
      charge: { id: "ch_1", amount: 400, currency: 840 as unknown as string },
    }),
  });

  assert.deepEqual(ack, { accepted: true, processed: 1, duplicates: 0 });
  const after = harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id });
  assert.equal(after?.amountRefundedMinor, 1000, "a non-string currency is not usable money, so the full charge is inferred");
  assert.equal(after?.status, "refunded");

  cleanup(harness.db, harness.dir);
});

test("webhook: BUG — pinning current behavior, not endorsing it — a second distinct partial-refund event that doesn't complete the refund is silently dropped rather than accumulated", async () => {
  // `canTransition(from, to)` is deliberately `false` when `from === to` (state-machine.ts: a
  // same-status "transition" is not a state change). `computeEventTransition` treats that `false`
  // identically to a genuinely-rejected transition (stale ordering, a terminal payment) and skips
  // applying the event ENTIRELY — including the amount update. That is asymmetric with the direct
  // `refund()` API path (`executeRefundAttempt`), which has its own separate branch that still
  // moves `amount_refunded_minor` even when the status doesn't change (see the charge-refund.test.ts
  // case with the same 300+300 shape). The trigger: a provider that reports "refunded" via
  // per-partial-refund webhook events, where an intermediate event doesn't itself reach the full
  // charge amount. Blast radius: the webhook-driven refunded total silently stops accumulating and
  // the dropped event is left in `p_lipay__events` with `applied = 0` forever, with no error
  // returned to the provider (the webhook still 2xxs) — a merchant's ledger would under-report how
  // much was actually refunded.
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const payment = await pendingPayment(harness, 1000);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);

  await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } }),
  });
  const firstRefund = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({
      id: "evt_2",
      type: "charge.refunded",
      createdSeconds: nowSeconds + 1,
      charge: { id: "ch_1", amount: 300, currency: "USD" },
    }),
  });
  assert.deepEqual(firstRefund, { accepted: true, processed: 1, duplicates: 0 });
  assert.equal(harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.status, "partially_refunded");

  // A second, genuinely distinct refund event (different provider_event_id) for another 300 — still
  // short of the 1000 charged, so the target status ("partially_refunded") equals the current one.
  const secondRefund = await harness.api.handleWebhook({
    providerId: "lipay",
    ...delivery({
      id: "evt_3",
      type: "charge.refunded",
      createdSeconds: nowSeconds + 2,
      charge: { id: "ch_1", amount: 300, currency: "USD" },
    }),
  });

  // `processed` counts every non-duplicate event, whether or not it was actually APPLIED to the
  // payment — so `processed: 1` here does not mean the refund total moved. It didn't:
  assert.deepEqual(secondRefund, { accepted: true, processed: 1, duplicates: 0 });
  const after = harness.api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id });
  assert.equal(after?.amountRefundedMinor, 300, "CURRENT (buggy) behavior: the second partial refund's amount is dropped");
  assert.equal(after?.status, "partially_refunded");
  const rows = eventRows(harness.db);
  assert.equal(rows.find((r) => r.provider_event_id === "evt_3")?.applied, 0, "the event is recorded but marked unapplied, forever");

  cleanup(harness.db, harness.dir);
});

test("webhook: an unexpected (non-constraint) database failure while recording an event propagates rather than being swallowed", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  const signed = delivery({ id: "evt_1", type: "charge.succeeded", createdSeconds: nowSeconds, charge: { id: "ch_1" } });
  harness.db.close();

  await assert.rejects(
    () => harness.api.handleWebhook({ providerId: "lipay", ...signed }),
    (err: unknown) => err instanceof TypeError && /database connection is not open/.test((err as Error).message)
  );

  fs.rmSync(harness.dir, { recursive: true, force: true });
});

test("webhook: an event carrying no charge data at all is a typed PROVIDER_ERROR, not a crash", async () => {
  const harness = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  await pendingPayment(harness);
  const nowSeconds = Math.floor(harness.clock.now() / 1000);
  // Valid top-level `id`/`type` (passes parseWebhook's own shape check) but no `data` object at
  // all — a materially different malformed shape from "data.id is missing", which is covered
  // separately.
  const rawBody = Buffer.from(JSON.stringify({ id: "evt_1", type: "charge.succeeded" }), "utf8");
  const signature = signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody, timestampSeconds: nowSeconds });

  const ack = await harness.api.handleWebhook({
    providerId: "lipay",
    rawBody,
    headers: { "x-lipay-signature": signature },
  });

  assert.equal(ack.accepted, false);
  assert.equal(ack.error?.code, "PROVIDER_ERROR");
  assert.match(ack.error?.message ?? "", /carries no charge id/);

  cleanup(harness.db, harness.dir);
});

test("webhook: the signing helper and the verifier agree byte for byte", () => {
  const rawBody = Buffer.from('{"id":"evt_1","nested":{"a":1,"b":[2,3]}}', "utf8");
  const header = signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody, timestampSeconds: 1_800_000_000 });

  const expected = createHmac("sha256", WEBHOOK_SECRET).update("1800000000.").update(rawBody).digest("hex");
  assert.equal(header, `t=1800000000,v1=${expected}`);
});
