/**
 * @file Outbound charge and refund: idempotency, capability gating, and the aggregate money
 * invariants the schema cannot express.
 *
 * The adversarial cases here are the ones that only fail across MULTIPLE records: a replayed
 * charge, a reused key carrying different money, and partial refunds that individually pass but
 * together exceed the payment. `amount_refunded_minor <= amount_minor` has no CHECK constraint
 * behind it, so it holds only if this chokepoint holds.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPaymentCredentials } from "../credentials.js";
import type { PaymentProvider } from "../ports.js";
import { chargeOk, cleanup, makeLipay, refundOk, SECRET_KEY, WORKSPACE_ID } from "./support.js";

const USD = (minorUnits: number) => ({ minorUnits, currency: "USD" });

test("charge: a successful charge shapes a real request and records a payment row", async () => {
  const { api, db, dir, http } = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });

  const result = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(2500),
    idempotencyKey: "order-1",
    reference: "order-1",
    customer: { email: "buyer@example.com" },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payment.status, "pending");
    assert.equal(result.payment.providerRef, "ch_1");
    assert.equal(result.payment.amount.currency, "USD");
    assert.equal(result.payment.amountRefundedMinor, 0);
    assert.deepEqual(result.next, { kind: "redirect", url: "https://lipay.test/checkout/ch_1" });
    assert.equal(result.replayed, false);
  }

  assert.equal(http.calls.length, 1);
  const call = http.calls[0];
  assert.equal(call.method, "POST");
  assert.equal(call.url, "https://lipay.test/v1/charges");
  assert.equal(call.headers.authorization, `Bearer ${SECRET_KEY}`);
  assert.equal(call.headers["idempotency-key"], "order-1");
  assert.deepEqual(JSON.parse(call.body ?? "{}"), {
    amount: 2500,
    currency: "USD",
    reference: "order-1",
    customer: { email: "buyer@example.com" },
    callback_url: "https://site.test/payments/webhook/lipay",
    return_url: "https://site.test/checkout/return",
  });

  cleanup(db, dir);
});

test("charge: replaying an idempotency key returns the original payment and never calls the provider twice", async () => {
  const { api, db, dir, http } = await makeLipay({ responses: [chargeOk("ch_1")] });
  const request = {
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(2500),
    idempotencyKey: "order-1",
  } as const;

  const first = await api.charge(request);
  const second = await api.charge(request);

  assert.equal(first.ok && second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(second.payment.id, first.payment.id);
    assert.equal(second.replayed, true);
    // Disclosed consequence of §3's schema: the next-action is transport state with no column.
    assert.equal(second.next, null);
  }
  assert.equal(http.calls.length, 1, "the provider was called exactly once for two identical requests");
  assert.equal(api.listPayments({ workspaceId: WORKSPACE_ID }).length, 1);

  cleanup(db, dir);
});

test("charge: the same key with a different amount is a conflict, not a silent replay", async () => {
  const { api, db, dir, http } = await makeLipay({ responses: [chargeOk("ch_1")] });

  await api.charge({ workspaceId: WORKSPACE_ID, providerId: "lipay", amount: USD(2500), idempotencyKey: "order-1" });
  const conflict = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(9900),
    idempotencyKey: "order-1",
  });

  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(http.calls.length, 1);

  cleanup(db, dir);
});

test("charge: the same key with a different currency is also a conflict", async () => {
  const { api, db, dir } = await makeLipay({ responses: [chargeOk("ch_1")] });

  await api.charge({ workspaceId: WORKSPACE_ID, providerId: "lipay", amount: USD(2500), idempotencyKey: "order-1" });
  const conflict = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: { minorUnits: 2500, currency: "EUR" },
    idempotencyKey: "order-1",
  });

  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "IDEMPOTENCY_CONFLICT");

  cleanup(db, dir);
});

test("charge: a missing credential bundle fails before any HTTP call and writes no payment row", async () => {
  const { api, db, dir, http } = await makeLipay({ credentials: new InMemoryPaymentCredentials() });

  const result = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(2500),
    idempotencyKey: "order-1",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "NO_CREDENTIALS_CONFIGURED");
    assert.equal(result.payment, null);
  }
  assert.equal(http.calls.length, 0);
  assert.equal(api.listPayments({ workspaceId: WORKSPACE_ID }).length, 0, "no attempt was possible, so none is recorded");

  cleanup(db, dir);
});

test("charge: malformed money is rejected before the provider is reached", async () => {
  const { api, db, dir, http } = await makeLipay();

  for (const amount of [
    { minorUnits: 0, currency: "USD" },
    { minorUnits: -100, currency: "USD" },
    { minorUnits: 10.5, currency: "USD" },
    { minorUnits: 100, currency: "usd" },
    { minorUnits: 100, currency: "DOLLARS" },
  ]) {
    const result = await api.charge({
      workspaceId: WORKSPACE_ID,
      providerId: "lipay",
      amount,
      idempotencyKey: `k-${amount.minorUnits}-${amount.currency}`,
    });
    assert.equal(result.ok, false, `${JSON.stringify(amount)} should have been rejected`);
    if (!result.ok) assert.equal(result.error.code, "INVALID_REQUEST");
  }
  assert.equal(http.calls.length, 0);

  cleanup(db, dir);
});

test("charge: a currency the provider does not accept is refused by core, not by the provider", async () => {
  const kesOnly: PaymentProvider = {
    id: "m-pesa",
    displayName: "M-Pesa",
    credentialKeys: ["secretKey"],
    capabilities: {
      refunds: "none",
      tokenization: false,
      recurring: false,
      confirmation: ["out_of_band"],
      currencies: ["KES"],
      webhooks: true,
    },
    async createCharge() {
      throw new Error("core must not reach the provider for an unsupported currency");
    },
    async parseWebhook() {
      return { ok: true, events: [] };
    },
  };

  const { api, db, dir } = await makeLipay({
    providers: [kesOnly],
    credentials: new InMemoryPaymentCredentials({ "m-pesa": { secretKey: "sk" } }),
  });

  const result = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "m-pesa",
    amount: USD(2500),
    idempotencyKey: "order-1",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CURRENCY_UNSUPPORTED");

  cleanup(db, dir);
});

test("charge: a declined charge is a typed DECLINED and marks the payment failed, never a throw", async () => {
  const { api, db, dir } = await makeLipay({
    responses: [{ status: 402, headers: {}, bodyText: JSON.stringify({ error: { code: "card_declined", message: "Card was declined." } }) }],
  });

  const result = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(2500),
    idempotencyKey: "order-1",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "DECLINED");
    assert.equal(result.error.retryable, false);
    assert.equal(result.payment?.status, "failed");
    assert.match(result.payment?.lastError ?? "", /DECLINED/);
  }

  cleanup(db, dir);
});

test("charge: a transport failure is typed and retryable, and the attempt is still recorded", async () => {
  const { api, db, dir } = await makeLipay({
    responses: [
      () => {
        throw new Error("egress refused: private address");
      },
    ],
  });

  const result = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(2500),
    idempotencyKey: "order-1",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "TRANSPORT_ERROR");
    assert.equal(result.error.retryable, true);
    assert.equal(result.payment?.status, "failed");
  }
  assert.equal(api.listPayments({ workspaceId: WORKSPACE_ID }).length, 1);

  cleanup(db, dir);
});

test("charge: a 5xx is retryable while a 4xx is not", async () => {
  const { api, db, dir } = await makeLipay({
    responses: [
      { status: 503, headers: {}, bodyText: "upstream unavailable" },
      { status: 400, headers: {}, bodyText: JSON.stringify({ error: { code: "bad_request", message: "nope" } }) },
    ],
  });

  const first = await api.charge({ workspaceId: WORKSPACE_ID, providerId: "lipay", amount: USD(100), idempotencyKey: "a" });
  const second = await api.charge({ workspaceId: WORKSPACE_ID, providerId: "lipay", amount: USD(100), idempotencyKey: "b" });

  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.equal(first.error.code, "PROVIDER_ERROR");
    assert.equal(first.error.retryable, true);
    assert.equal(first.error.providerStatus, 503);
  }
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error.retryable, false);

  cleanup(db, dir);
});

test("charge: workspace scoping — another workspace cannot read the payment", async () => {
  const { api, db, dir } = await makeLipay({ responses: [chargeOk("ch_1")] });

  const created = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(2500),
    idempotencyKey: "order-1",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.notEqual(api.getPayment({ workspaceId: WORKSPACE_ID, id: created.payment.id }), null);
  assert.equal(api.getPayment({ workspaceId: "workspace-2", id: created.payment.id }), null);
  assert.equal(api.listPayments({ workspaceId: "workspace-2" }).length, 0);

  cleanup(db, dir);
});

async function succeededPayment(responses: readonly unknown[]) {
  const harness = await makeLipay({ responses: responses as never });
  const created = await harness.api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(1000),
    idempotencyKey: "order-1",
  });
  if (!created.ok) throw new Error("charge fixture failed");
  return { ...harness, payment: created.payment };
}

test("refund: a partial refund moves the payment to partially_refunded and accumulates the total", async () => {
  const { api, db, dir, payment } = await succeededPayment([chargeOk("ch_1", "succeeded"), refundOk("re_1"), refundOk("re_2")]);
  assert.equal(payment.status, "succeeded");

  const first = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "refund-1",
    amount: USD(400),
    reason: "partial return",
  });

  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.payment.status, "partially_refunded");
    assert.equal(first.payment.amountRefundedMinor, 400);
    assert.equal(first.refund.status, "succeeded");
    assert.equal(first.refund.providerRef, "re_1");
  }

  const second = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "refund-2",
    amount: USD(600),
  });

  assert.equal(second.ok, true);
  if (second.ok) {
    assert.equal(second.payment.status, "refunded");
    assert.equal(second.payment.amountRefundedMinor, 1000);
  }

  cleanup(db, dir);
});

test("refund: partial refunds that individually pass but together exceed the payment are rejected", async () => {
  const { api, db, dir, payment, http } = await succeededPayment([
    chargeOk("ch_1", "succeeded"),
    refundOk("re_1"),
    refundOk("re_2"),
  ]);

  const first = await api.refund({ workspaceId: WORKSPACE_ID, paymentId: payment.id, idempotencyKey: "r1", amount: USD(700) });
  assert.equal(first.ok, true);

  const callsBefore = http.calls.length;
  const overshoot = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "r2",
    amount: USD(700),
  });

  assert.equal(overshoot.ok, false);
  if (!overshoot.ok) {
    assert.equal(overshoot.error.code, "INVALID_REQUEST");
    assert.match(overshoot.error.message, /exceeds the 300 still refundable/);
  }
  assert.equal(http.calls.length, callsBefore, "the over-refund never reached the provider");
  assert.equal(api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.amountRefundedMinor, 700);

  cleanup(db, dir);
});

test("refund: omitting the amount refunds exactly what remains", async () => {
  const { api, db, dir, payment } = await succeededPayment([
    chargeOk("ch_1", "succeeded"),
    refundOk("re_1"),
    refundOk("re_2"),
  ]);

  await api.refund({ workspaceId: WORKSPACE_ID, paymentId: payment.id, idempotencyKey: "r1", amount: USD(250) });
  const rest = await api.refund({ workspaceId: WORKSPACE_ID, paymentId: payment.id, idempotencyKey: "r2" });

  assert.equal(rest.ok, true);
  if (rest.ok) {
    assert.equal(rest.refund.amount.minorUnits, 750);
    assert.equal(rest.payment.status, "refunded");
    assert.equal(rest.payment.amountRefundedMinor, 1000);
  }

  cleanup(db, dir);
});

test("refund: replaying a refund key returns the stored refund without calling the provider again", async () => {
  const { api, db, dir, payment, http } = await succeededPayment([chargeOk("ch_1", "succeeded"), refundOk("re_1")]);

  const first = await api.refund({ workspaceId: WORKSPACE_ID, paymentId: payment.id, idempotencyKey: "r1", amount: USD(400) });
  const callsAfterFirst = http.calls.length;
  const replay = await api.refund({ workspaceId: WORKSPACE_ID, paymentId: payment.id, idempotencyKey: "r1", amount: USD(400) });

  assert.equal(first.ok && replay.ok, true);
  if (first.ok && replay.ok) {
    assert.equal(replay.refund.id, first.refund.id);
    assert.equal(replay.replayed, true);
  }
  assert.equal(http.calls.length, callsAfterFirst);
  assert.equal(api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.amountRefundedMinor, 400);

  cleanup(db, dir);
});

test("refund: reusing a refund key for a different amount is a conflict", async () => {
  const { api, db, dir, payment } = await succeededPayment([chargeOk("ch_1", "succeeded"), refundOk("re_1")]);

  await api.refund({ workspaceId: WORKSPACE_ID, paymentId: payment.id, idempotencyKey: "r1", amount: USD(400) });
  const conflict = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "r1",
    amount: USD(500),
  });

  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "IDEMPOTENCY_CONFLICT");

  cleanup(db, dir);
});

test("refund: a pending payment cannot be refunded", async () => {
  const { api, db, dir } = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const created = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(1000),
    idempotencyKey: "order-1",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await api.refund({ workspaceId: WORKSPACE_ID, paymentId: created.payment.id, idempotencyKey: "r1" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_REQUEST");
    assert.match(result.error.message, /status 'pending' cannot be refunded/);
  }

  cleanup(db, dir);
});

test("refund: a provider that declares full-refunds-only rejects a partial one before any HTTP", async () => {
  let refundCalls = 0;
  const fullOnly: PaymentProvider = {
    id: "acme",
    displayName: "Acme",
    credentialKeys: ["secretKey"],
    capabilities: {
      refunds: "full",
      tokenization: false,
      recurring: false,
      confirmation: ["none"],
      currencies: "any",
      webhooks: false,
    },
    async createCharge() {
      return { ok: true, providerRef: "acme_1", status: "succeeded", next: { kind: "none" } };
    },
    async refund() {
      refundCalls += 1;
      return { ok: true, providerRef: "acme_re_1", status: "succeeded" };
    },
    async parseWebhook() {
      return { ok: true, events: [] };
    },
  };

  const { api, db, dir } = await makeLipay({
    providers: [fullOnly],
    credentials: new InMemoryPaymentCredentials({ acme: { secretKey: "sk" } }),
  });
  const created = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "acme",
    amount: USD(1000),
    idempotencyKey: "order-1",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const partial = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: created.payment.id,
    idempotencyKey: "r1",
    amount: USD(400),
  });
  assert.equal(partial.ok, false);
  if (!partial.ok) assert.equal(partial.error.code, "CAPABILITY_UNSUPPORTED");
  assert.equal(refundCalls, 0);

  const full = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: created.payment.id,
    idempotencyKey: "r2",
    amount: USD(1000),
  });
  assert.equal(full.ok, true);
  assert.equal(refundCalls, 1);

  cleanup(db, dir);
});

test("refund: a provider that declares no refund support is refused by core", async () => {
  const noRefunds: PaymentProvider = {
    id: "acme",
    displayName: "Acme",
    credentialKeys: ["secretKey"],
    capabilities: {
      refunds: "none",
      tokenization: false,
      recurring: false,
      confirmation: ["none"],
      currencies: "any",
      webhooks: false,
    },
    async createCharge() {
      return { ok: true, providerRef: "acme_1", status: "succeeded", next: { kind: "none" } };
    },
    async parseWebhook() {
      return { ok: true, events: [] };
    },
  };

  const { api, db, dir } = await makeLipay({
    providers: [noRefunds],
    credentials: new InMemoryPaymentCredentials({ acme: { secretKey: "sk" } }),
  });
  const created = await api.charge({
    workspaceId: WORKSPACE_ID,
    providerId: "acme",
    amount: USD(1000),
    idempotencyKey: "order-1",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await api.refund({ workspaceId: WORKSPACE_ID, paymentId: created.payment.id, idempotencyKey: "r1" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CAPABILITY_UNSUPPORTED");

  cleanup(db, dir);
});

test("charge: an empty or whitespace-only idempotency key is rejected before any HTTP call", async () => {
  const { api, db, dir, http } = await makeLipay();

  for (const idempotencyKey of ["", "   ", "\t\n"]) {
    const result = await api.charge({
      workspaceId: WORKSPACE_ID,
      providerId: "lipay",
      amount: USD(2500),
      idempotencyKey,
    });
    assert.equal(result.ok, false, `${JSON.stringify(idempotencyKey)} should have been rejected`);
    if (!result.ok) assert.equal(result.error.code, "INVALID_REQUEST");
  }
  assert.equal(http.calls.length, 0);

  cleanup(db, dir);
});

test("charge: two concurrent charges racing the same idempotency key resolve to one payment, not a crash", async () => {
  const { api, db, dir, http } = await makeLipay({ responses: [chargeOk("ch_1", "pending")] });
  const request = {
    workspaceId: WORKSPACE_ID,
    providerId: "lipay",
    amount: USD(2500),
    idempotencyKey: "race-1",
  } as const;

  // Both calls run their synchronous prefix (including the upfront "does this key already exist?"
  // read) before either reaches the first `await` — the same interleaving window a real double-click
  // or client retry racing an in-flight request produces on one Node process.
  const [first, second] = await Promise.all([api.charge(request), api.charge(request)]);

  assert.equal(first.ok && second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.payment.id, second.payment.id, "both concurrent calls resolve to the SAME payment row");
    assert.equal(
      [first.replayed, second.replayed].filter((replayed) => replayed).length,
      1,
      "exactly one of the two lost the race to the UNIQUE index and was reconciled, not both"
    );
  }
  assert.equal(http.calls.length, 1, "only the race's winner ever reached the provider");
  assert.equal(api.listPayments({ workspaceId: WORKSPACE_ID }).length, 1, "no duplicate payment row from the race");

  cleanup(db, dir);
});

test("refund: malformed amount is rejected before the provider is reached", async () => {
  const { api, db, dir, http, payment } = await succeededPayment([chargeOk("ch_1", "succeeded")]);

  for (const amount of [
    { minorUnits: 0, currency: "USD" },
    { minorUnits: -100, currency: "USD" },
    { minorUnits: 10.5, currency: "USD" },
    { minorUnits: 100, currency: "usd" },
    { minorUnits: 100, currency: "DOLLARS" },
  ]) {
    const result = await api.refund({
      workspaceId: WORKSPACE_ID,
      paymentId: payment.id,
      idempotencyKey: `k-${amount.minorUnits}-${amount.currency}`,
      amount,
    });
    assert.equal(result.ok, false, `${JSON.stringify(amount)} should have been rejected`);
    if (!result.ok) assert.equal(result.error.code, "INVALID_REQUEST");
  }
  assert.equal(http.calls.length, 1, "only the original charge reached the provider; no refund attempt did");

  cleanup(db, dir);
});

test("refund: a currency different from the original charge's is refused, not silently converted", async () => {
  const { api, db, dir, payment } = await succeededPayment([chargeOk("ch_1", "succeeded")]);

  const result = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "r1",
    amount: { minorUnits: 100, currency: "EUR" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "CURRENCY_UNSUPPORTED");
    assert.match(result.error.message, /does not match the payment's USD/);
  }

  cleanup(db, dir);
});

test("refund: a missing credential bundle fails before any HTTP call, mirroring charge's own gate", async () => {
  const { api, db, dir, http, credentials, payment } = await succeededPayment([chargeOk("ch_1", "succeeded")]);
  credentials.set("lipay", null);

  const result = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "r1",
    amount: USD(400),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "NO_CREDENTIALS_CONFIGURED");
  assert.equal(http.calls.length, 1, "only the original charge reached the provider; the refund never did");

  cleanup(db, dir);
});

const refundRows = (db: import("better-sqlite3").Database) =>
  db.prepare(`SELECT * FROM "p_lipay__refunds" ORDER BY created_at, id`).all() as {
    id: string;
    payment_id: string;
    status: string;
    provider_ref: string | null;
  }[];

test("refund: a provider-side failure marks the refund row failed, never a throw", async () => {
  const { api, db, dir, payment } = await succeededPayment([
    chargeOk("ch_1", "succeeded"),
    { status: 500, headers: {}, bodyText: "upstream unavailable" },
  ]);

  const result = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "r1",
    amount: USD(400),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_ERROR");
    assert.equal(result.error.retryable, true);
  }
  const rows = refundRows(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  // The payment itself is untouched by a refund attempt that never reached the provider successfully.
  assert.equal(api.getPayment({ workspaceId: WORKSPACE_ID, id: payment.id })?.amountRefundedMinor, 0);

  cleanup(db, dir);
});

test("refund: a provider-pending refund does not advance amount_refunded_minor until confirmed", async () => {
  const { api, db, dir, payment } = await succeededPayment([
    chargeOk("ch_1", "succeeded"),
    { status: 200, headers: {}, bodyText: JSON.stringify({ id: "re_1", status: "pending" }) },
  ]);

  const result = await api.refund({
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "r1",
    amount: USD(400),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.refund.status, "pending");
    assert.equal(result.payment.amountRefundedMinor, 0, "a still-pending refund must not move the payment's total");
    assert.equal(result.payment.status, "succeeded", "the payment stays put until the refund is confirmed");
  }

  cleanup(db, dir);
});

test("refund: two concurrent refunds racing the same idempotency key resolve to one refund, not a crash", async () => {
  const { api, db, dir, http, payment } = await succeededPayment([chargeOk("ch_1", "succeeded"), refundOk("re_1")]);
  const request = {
    workspaceId: WORKSPACE_ID,
    paymentId: payment.id,
    idempotencyKey: "refund-race-1",
    amount: USD(400),
  } as const;

  const [first, second] = await Promise.all([api.refund(request), api.refund(request)]);

  assert.equal(first.ok && second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.refund.id, second.refund.id, "both concurrent calls resolve to the SAME refund row");
    assert.equal(
      [first.replayed, second.replayed].filter((replayed) => replayed).length,
      1,
      "exactly one of the two lost the race to the UNIQUE index and was reconciled, not both"
    );
  }
  assert.equal(http.calls.length, 2, "one charge call plus exactly one refund call — the race's other side never reached the provider");

  cleanup(db, dir);
});
