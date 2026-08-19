/**
 * @file The payment status machine. `declareDataModule()` has no CHECK constraint, so this module
 * is the only thing standing between a late or hostile webhook and an illegal state change.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransition,
  isTerminalPaymentStatus,
  statusForEventKind,
  TERMINAL_PAYMENT_STATUSES,
  type PaymentStatus,
} from "../state-machine.js";

const ALL: readonly PaymentStatus[] = [
  "pending",
  "succeeded",
  "failed",
  "refunded",
  "partially_refunded",
  "canceled",
];

test("state machine: the legal transitions are exactly the ones the design names", () => {
  const legal = new Set([
    "pending>succeeded",
    "pending>failed",
    "pending>canceled",
    "succeeded>partially_refunded",
    "succeeded>refunded",
    "partially_refunded>refunded",
  ]);

  for (const from of ALL) {
    for (const to of ALL) {
      assert.equal(
        canTransition(from, to),
        legal.has(`${from}>${to}`),
        `${from} → ${to} was classified wrongly`
      );
    }
  }
});

test("state machine: terminal states reject every further transition", () => {
  assert.deepEqual([...TERMINAL_PAYMENT_STATUSES].sort(), ["canceled", "failed", "refunded"]);
  for (const terminal of TERMINAL_PAYMENT_STATUSES) {
    assert.ok(isTerminalPaymentStatus(terminal));
    for (const to of ALL) {
      assert.equal(canTransition(terminal, to), false, `${terminal} must be terminal, but allowed → ${to}`);
    }
  }
});

test("state machine: succeeded never returns to pending, and no status transitions to itself", () => {
  assert.equal(canTransition("succeeded", "pending"), false);
  assert.equal(canTransition("partially_refunded", "pending"), false);
  assert.equal(canTransition("partially_refunded", "succeeded"), false);
  for (const status of ALL) assert.equal(canTransition(status, status), false);
});

test("state machine: a refund event resolves to partial or full by amount, not by event name", () => {
  assert.equal(statusForEventKind("refunded", { refundedMinor: 400, totalMinor: 1000 }), "partially_refunded");
  assert.equal(statusForEventKind("refunded", { refundedMinor: 1000, totalMinor: 1000 }), "refunded");
  // Over-refund cannot arise (core caps the total), but must not read as "partial" if it ever did.
  assert.equal(statusForEventKind("refunded", { refundedMinor: 1200, totalMinor: 1000 }), "refunded");
});

test("state machine: event kinds carrying no status claim map to null rather than being forced", () => {
  const nothing = { refundedMinor: 0, totalMinor: 1000 };
  assert.equal(statusForEventKind("pending", nothing), null);
  // A chargeback is not a refund — the money is pulled by the issuer and the merchant's dispute
  // rights differ — and §3's status set has no member for it, so it is recorded, never mapped.
  assert.equal(statusForEventKind("chargeback", nothing), null);
  assert.equal(statusForEventKind("succeeded", nothing), "succeeded");
  assert.equal(statusForEventKind("failed", nothing), "failed");
  // An expired out-of-band window (PIX/boleto/USSD) can never complete.
  assert.equal(statusForEventKind("expired", nothing), "canceled");
});
