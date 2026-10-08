import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listIndexes } from "#src/platform/db/kernel/dialect";
import type { HttpResponse } from "#src/platform/http/index";
import { InMemoryPaymentCredentials } from "@jini-ai/commerce/payments";
import { activateLipay, type LipayApi } from "../lipay-plugin.js";
import { createLipayGateway, signLipayWebhook } from "@jini-ai/commerce/payments";
import { API_BASE, chargeOk, FakeHttpClient, refundOk, SECRET_KEY, TestClock, testIdGen, WEBHOOK_SECRET, WORKSPACE_ID } from "./support.js";

/**
 * @file lipay's data paths on every dialect (storage plan P2): the idempotency UNIQUE indexes
 * (outbound charge/refund replay and the concurrent-race path, inbound event dedupe), the refund
 * total moving with the refund row, the webhook's state advance and out-of-order rejection, and the
 * reads — one body on SQLite and PGlite. `make` drops the tables this file creates first, since the
 * PGlite instance is shared across the file.
 */

const OWN_TABLES = [
  "p_lipay__payments",
  "p_lipay__events",
  "p_lipay__refunds",
  "_plugin_migrations",
  "_plugin_migration_journal",
  "_plugin_identity",
];

function fresh(base: ContentKernel): ContentKernel {
  const pending = OWN_TABLES.reduce(
    (chain, table) => chain.then(() => base.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`)),
    Promise.resolve()
  );
  pending.catch(() => {});
  return heldUntil(base, pending);
}

const USD = (minorUnits: number) => ({ minorUnits, currency: "USD" });
const START = Date.UTC(2026, 6, 30, 12, 0, 0);

async function lipayOn(kernel: ContentKernel, responses: readonly HttpResponse[]): Promise<{ api: LipayApi; http: FakeHttpClient; clock: TestClock }> {
  const http = new FakeHttpClient(responses);
  const clock = new TestClock(START);
  const api = await activateLipay({
    db: kernel,
    dbPath: ":memory:",
    workspaceId: WORKSPACE_ID,
    httpClient: http,
    credentials: new InMemoryPaymentCredentials({ lipay: { secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET } }),
    providers: [createLipayGateway({ apiBaseUrl: API_BASE })],
    clock,
    idGen: testIdGen("pay"),
    webhookBaseUrl: "https://site.test",
    returnUrl: "https://site.test/checkout/return",
  });
  return { api, http, clock };
}

function delivery(event: { id: string; type: string; createdSeconds: number; charge: { id: string; amount?: number; currency?: string } }) {
  const rawBody = Buffer.from(JSON.stringify({ id: event.id, type: event.type, created: event.createdSeconds, data: event.charge }), "utf8");
  const signature = signLipayWebhook({ secret: WEBHOOK_SECRET, rawBody, timestampSeconds: event.createdSeconds });
  return { providerId: "lipay", rawBody, headers: { "content-type": "application/json", "x-lipay-signature": signature } };
}

describeEachDialect<ContentKernel>("lipay plugin data", { tables: [], make: fresh }, (makeKernel) => {
  test("declares the idempotency and dedupe indexes as UNIQUE", async () => {
    const kernel = makeKernel();
    await lipayOn(kernel, []);
    const unique = async (table: string, name: string) => (await listIndexes(kernel, table)).get(name)?.unique;
    assert.equal(await unique("p_lipay__payments", "idx_p_lipay__payments__idem"), true);
    assert.equal(await unique("p_lipay__refunds", "idx_p_lipay__refunds__idem"), true);
    assert.equal(await unique("p_lipay__events", "idx_p_lipay__events__dedupe"), true);
  });

  test("charge: a replayed key returns the stored payment; a concurrent race yields one row and one provider call", async () => {
    const kernel = makeKernel();
    const { api, http } = await lipayOn(kernel, [chargeOk("ch_1", "succeeded")]);
    const request = { workspaceId: WORKSPACE_ID, providerId: "lipay", amount: USD(2500), idempotencyKey: "order-1" };

    const [a, b] = await Promise.all([api.charge(request), api.charge(request)]);
    assert.ok(a.ok && b.ok);
    assert.equal(a.payment.id, b.payment.id);
    assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]);
    assert.equal(http.calls.length, 1);

    const replay = await api.charge(request);
    assert.ok(replay.ok && replay.replayed);
    const stored = await api.getPayment({ workspaceId: WORKSPACE_ID, id: a.payment.id });
    assert.deepEqual([stored?.status, stored?.providerRef, stored?.amount.minorUnits], ["succeeded", "ch_1", 2500]);
    assert.equal((await api.listPayments({ workspaceId: WORKSPACE_ID })).length, 1);
    assert.equal(await api.getPayment({ workspaceId: "workspace-2", id: a.payment.id }), null);
  });

  test("refund: partial refunds accumulate the total and advance the status; a replayed key is not refunded twice", async () => {
    const kernel = makeKernel();
    const { api, http } = await lipayOn(kernel, [chargeOk("ch_1", "succeeded"), refundOk("re_1"), refundOk("re_2")]);
    const charged = await api.charge({ workspaceId: WORKSPACE_ID, providerId: "lipay", amount: USD(1000), idempotencyKey: "order-1" });
    assert.ok(charged.ok);
    const paymentId = charged.payment.id;

    const first = await api.refund({ workspaceId: WORKSPACE_ID, paymentId, idempotencyKey: "r-1", amount: USD(400) });
    assert.ok(first.ok);
    assert.deepEqual([first.payment.status, first.payment.amountRefundedMinor], ["partially_refunded", 400]);

    const replay = await api.refund({ workspaceId: WORKSPACE_ID, paymentId, idempotencyKey: "r-1", amount: USD(400) });
    assert.ok(replay.ok && replay.replayed);

    const rest = await api.refund({ workspaceId: WORKSPACE_ID, paymentId, idempotencyKey: "r-2" });
    assert.ok(rest.ok);
    assert.deepEqual([rest.payment.status, rest.payment.amountRefundedMinor], ["refunded", 1000]);
    assert.equal(http.calls.length, 3);
  });

  test("webhook: advances the payment once, dedupes a replayed event, and never moves state backwards", async () => {
    const kernel = makeKernel();
    const { api } = await lipayOn(kernel, [chargeOk("ch_1", "pending")]);
    const charged = await api.charge({ workspaceId: WORKSPACE_ID, providerId: "lipay", amount: USD(1000), idempotencyKey: "order-1" });
    assert.ok(charged.ok);
    const seconds = Math.floor(START / 1000);

    const succeeded = delivery({ id: "evt_2", type: "charge.succeeded", createdSeconds: seconds, charge: { id: "ch_1" } });
    assert.deepEqual(await api.handleWebhook(succeeded), { accepted: true, processed: 1, duplicates: 0 });
    assert.deepEqual(await api.handleWebhook(succeeded), { accepted: true, processed: 0, duplicates: 1 });

    const older = delivery({ id: "evt_1", type: "charge.failed", createdSeconds: seconds - 60, charge: { id: "ch_1" } });
    assert.deepEqual(await api.handleWebhook(older), { accepted: true, processed: 1, duplicates: 0 });
    assert.equal((await api.getPayment({ workspaceId: WORKSPACE_ID, id: charged.payment.id }))?.status, "succeeded");

    const events = await kernel.query<{ provider_event_id: string; applied: number }>(
      sql`SELECT provider_event_id, applied FROM p_lipay__events ORDER BY provider_event_id`
    );
    assert.deepEqual(
      events.map((e) => [e.provider_event_id, Number(e.applied)]),
      [
        ["evt_1", 0],
        ["evt_2", 1],
      ]
    );
  });
});
