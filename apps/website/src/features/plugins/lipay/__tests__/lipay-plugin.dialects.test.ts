import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listIndexes } from "#src/platform/db/kernel/dialect";
import { lipayOn, refundGrant, SCOPE } from "./support.js";

/**
 * @file lipay's data paths on every dialect (storage plan P2), on Jini's payments kernel since
 * 2026-10-21: the legacy `p_lipay__*` tables are still declared (they hold money history the
 * kernel's migration step `0005` imports), the kernel ledger's idempotency UNIQUE keys hold
 * (outbound intent replay and the concurrent-race path), and refunds accumulate on the payment —
 * one body on SQLite and PGlite. `make` drops the tables this file creates first, since the PGlite
 * instance is shared across the file. Webhook ingest is the kernel's receiver + inbox worker now,
 * tested in Jini (`payments/ingest`), not through this adapter.
 */

const OWN_TABLES = [
  "commerce_operator_actions",
  "commerce_payment_attempts",
  "commerce_refunds",
  "commerce_disputes",
  "commerce_payment_evidence",
  "commerce_quarantine",
  "commerce_outbox",
  "commerce_webhook_inbox",
  "commerce_payments",
  "commerce_payments_migrations",
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

describeEachDialect<ContentKernel>("lipay plugin data", { tables: [], make: fresh }, (makeKernel) => {
  test("declares the legacy tables' idempotency and dedupe indexes as UNIQUE (kept for the ledger import)", async () => {
    const kernel = makeKernel();
    await lipayOn(kernel, ":memory:");
    const unique = async (table: string, name: string) => (await listIndexes(kernel, table)).get(name)?.unique;
    assert.equal(await unique("p_lipay__payments", "idx_p_lipay__payments__idem"), true);
    assert.equal(await unique("p_lipay__refunds", "idx_p_lipay__refunds__idem"), true);
    assert.equal(await unique("p_lipay__events", "idx_p_lipay__events__dedupe"), true);
  });

  test("createIntent: a replayed key returns the stored payment; a concurrent race yields one payment", async () => {
    const kernel = makeKernel();
    const { api } = await lipayOn(kernel, ":memory:");
    const request = { scope: SCOPE, amount: USD(2500), idempotencyKey: "order-1", reference: "order-1" };

    const [a, b] = await Promise.all([api.createIntent(request), api.createIntent(request)]);
    assert.ok(a.ok && b.ok);
    assert.equal(a.payment.id, b.payment.id);
    assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]);

    const replay = await api.createIntent(request);
    assert.ok(replay.ok && replay.replayed);
    const stored = await api.getPayment({ scope: SCOPE, paymentId: a.payment.id });
    assert.deepEqual([stored?.status, stored?.amount.minorUnits], ["succeeded", 2500]);
    assert.equal(await api.getPayment({ scope: { ...SCOPE, workspaceId: "workspace-2" }, paymentId: a.payment.id }), null);
    const rows = await kernel.query<{ n: number }>(sql`SELECT COUNT(*) AS n FROM commerce_payments`);
    assert.equal(Number(rows[0]?.n), 1);
  });

  test("refund: partial refunds accumulate on the payment; a replayed key is not refunded twice", async () => {
    const kernel = makeKernel();
    const { api, server, grants, clock } = await lipayOn(kernel, ":memory:");
    const charged = await api.createIntent({ scope: SCOPE, amount: USD(1000), idempotencyKey: "order-1", reference: "order-1" });
    assert.ok(charged.ok);
    const paymentId = charged.payment.id;

    const grant = await refundGrant({ grants, clock, paymentId, minorUnits: 400, idempotencyKey: "r-1" });
    const first = await api.refund({ scope: SCOPE, paymentId, amount: USD(400), idempotencyKey: "r-1", grant });
    assert.ok(first.ok);
    // LiPay answers a refund `pending`: the money is held until the provider settles it.
    assert.deepEqual([first.refund.status, first.payment.refundHeld.minorUnits], ["pending", 400]);

    const replay = await api.refund({ scope: SCOPE, paymentId, amount: USD(400), idempotencyKey: "r-1", grant });
    assert.ok(replay.ok && replay.replayed);
    assert.equal(replay.refund.id, first.refund.id);
    assert.equal(server.refundOf({ refundId: "re_3" }), undefined, "a replay never reaches the provider");
    const refunds = await kernel.query<{ n: number }>(sql`SELECT COUNT(*) AS n FROM commerce_refunds`);
    assert.equal(Number(refunds[0]?.n), 1);
  });
});
