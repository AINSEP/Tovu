import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import express from "express";
import { sql } from "kysely";
import { createCommerceServer, createOrderPaymentProjector, type CommerceOrderView } from "@jini-ai/commerce";
import { commerceOrderPaymentRepoFor, commerceOrderRepoFor, commercePriceProviderRefRepoFor,
  commercePriceRepoFor, commerceProductRepoFor } from "@jini-ai/commerce/repo";
import { createInboxWorker, createKernelProviderRegistry, createMemoryGrantStore, createOutboxRelay,
  createPaymentsService, createProviderContexts, createWebhookReceiver, leasedProviderItem, noopAlertPort,
  paymentsProviderContract, type ProviderContext } from "@jini-ai/commerce/payments/kernel";
import { migrateCommercePayments, sqlPaymentsLedger } from "@jini-ai/commerce/payments/ledger/sql";
import { registerPaymentsWebhookRoute } from "@jini-ai/commerce/http";
import { createPluginContributionCapture, createPluginContributionRegistry, createPluginProviderHost,
  type PluginManifest, type PluginSdk } from "@jini-ai/plugins/host";
import { InMemoryMemberRepo, InMemoryMemberSessionRepo } from "#src/features/members/repo.memory";
import { openMemorySqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import { openPostgresKernel } from "#src/platform/db/kernel/drivers/postgres";
import { migrateCommerceDatabase } from "#src/platform/db/migrations/index";
import { registerCommerceRoutes } from "../purchase.js";

const scope = { workspaceId: "shop", siteId: "site", providerId: "stripe", providerAccountId: "acct_fixture", mode: "test" as const };
const total = { minorUnits: 2400, currency: "JPY" };
const webhookSecret = "whsec_integration_fixture_not_real";
const ordersPath = "/api/commerce/v1/workspaces/shop/orders";
type Dialect = "sqlite" | "pglite" | "postgres";

/** A dedicated pool's startup search_path scopes raw migration SQL and query builders alike. */
async function kernelFor(t: test.TestContext, dialect: Dialect) {
  if (dialect === "sqlite") return openMemorySqliteKernel<unknown>();
  if (dialect === "pglite") return openPgliteKernel<unknown>();
  const connection = new URL(process.env.COMMERCE_PG_URL ?? `postgresql://${encodeURIComponent(process.env.PGUSER ?? "la")}@/postgres`);
  if (!process.env.COMMERCE_PG_URL) {
    connection.searchParams.set("host", process.env.PGHOST ?? "/tmp");
    if (process.env.PGPORT) connection.searchParams.set("port", process.env.PGPORT);
  }
  const admin = openPostgresKernel<unknown>({ connectionString: connection.href });
  const schema = `commerce_settlement_${randomUUID().replaceAll("-", "")}`;
  await admin.execute(sql`CREATE SCHEMA ${sql.id(schema)}`);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  const kernel = openPostgresKernel<unknown>({ connectionString: connection.href, max: 3 });
  t.after(async () => {
    await kernel.close();
    try { await admin.execute(sql`DROP SCHEMA ${sql.id(schema)} CASCADE`); }
    finally { await admin.close(); }
  });
  return kernel;
}

/** Load the packaged provider through its public manifest; no source paths or version pins. */
async function stripeHost() {
  const manifestFile = createRequire(import.meta.url).resolve("@jini-ai/provider-plugins/payments-stripe");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as PluginManifest;
  const plugin = await import(pathToFileURL(path.join(path.dirname(manifestFile), "server/index.mjs")).href) as {
    default: { definition: { setup(sdk: PluginSdk): void } };
  };
  const contributions = createPluginContributionRegistry({});
  const capture = createPluginContributionCapture({ manifest });
  const sdk = { providers: capture.providers } as PluginSdk;
  plugin.default.definition.setup(sdk);
  contributions.replace({ contributions: capture.seal({ sdk }) });
  const host = createPluginProviderHost({ contributions, contracts: [paymentsProviderContract] });
  const lease = await host.initialize({ contract: "payments", id: "stripe", input: {} });
  assert.ok(lease);
  const item = leasedProviderItem({ pluginId: "payments-stripe", lease });
  assert.ok(!("problem" in item));
  return { host, item };
}

/** Real HTTP/member boundary, catalog, SQL ledger and provider; only Stripe's outbound HTTP is fake. */
async function fixture(t: test.TestContext, dialect: Dialect) {
  const kernel = await kernelFor(t, dialect);
  if (dialect !== "postgres") t.after(() => kernel.close());
  const { host, item } = await stripeHost();
  t.after(() => host.dispose({}));
  let now = 1_800_000_000_000, sequence = 0;
  const clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const newId = () => { sequence += 1; return `commerce_${sequence}`; };
  const requests: Parameters<ProviderContext["httpClient"]["send"]>[0][] = [];
  const session = { object: "checkout.session", id: "cs_fixture", mode: "payment", livemode: false,
    amount_total: total.minorUnits, currency: "jpy", status: "open", payment_status: "unpaid",
    metadata: { jini_payment_id: "" }, url: "https://checkout.stripe.com/c/fixture" };
  const httpClient: ProviderContext["httpClient"] = { send: async input => {
    assert.equal(input.request.method, "POST");
    assert.equal(input.request.url, "https://api.stripe.com/v1/checkout/sessions");
    requests.push(structuredClone(input));
    const form = new URLSearchParams(input.request.body as string);
    assert.equal(form.get("line_items[0][price_data][unit_amount]"), "1200");
    assert.equal(form.get("line_items[0][quantity]"), "2");
    assert.equal(form.get("success_url"), "https://shop.example.test/commerce/return");
    session.metadata.jini_payment_id = form.get("metadata[jini_payment_id]")!;
    return { status: 200, headers: {}, bodyText: JSON.stringify(session) };
  } };
  const bindings = { stripe: "payments-stripe" };
  const providers = createKernelProviderRegistry({ items: [item] }, { bindings });
  const contexts = createProviderContexts({ bindings, httpClient, now: clock.nowMs,
    configFor: () => ({ read: async () => ({ settings: { accountId: scope.providerAccountId },
      secrets: { test_secretKey: "sk_test_integration_fixture_not_real", test_webhookSecret: webhookSecret } }) }),
    urlsFor: () => ({ returnUrl: "https://shop.example.test/commerce/return", cancelUrl: "https://shop.example.test/commerce/cancel",
      webhookUrl: "https://shop.example.test/api/payments/webhooks/site/stripe/test" }) });
  const ledger = sqlPaymentsLedger({ kernel });
  const paymentDeps = { ledger, providers, contexts, now: clock.nowMs, newId,
    grants: createMemoryGrantStore({ now: clock.nowMs, newToken: newId }) };
  const payments = createPaymentsService(paymentDeps);
  const products = commerceProductRepoFor({ kernel }), prices = commercePriceRepoFor({ kernel }), orders = commerceOrderRepoFor({ kernel });
  const orderPayments = commerceOrderPaymentRepoFor({ kernel }), priceRefs = commercePriceProviderRefRepoFor({ kernel });
  const settle = { orders, orderPayments, payments, alerts: noopAlertPort, clock };
  const commerce = createCommerceServer({ scope, publicOrigin: "https://shop.example.test", isActive: () => true,
    ensureSchema: async () => { await migrateCommerceDatabase({ kernel }); await migrateCommercePayments({ kernel }); },
    checkoutDeps: { products, prices, orders, clock, idGen: { newId } },
    payOrderDeps: { orders, prices, priceRefs, orderPayments, payments, settle }, warn: message => assert.fail(message) });
  assert.equal((await commerce.activate()).ready, true);
  await products.save({ id: "book", workspaceId: scope.workspaceId, name: "Book", slug: "book", kind: "one_time", status: "active",
    createdAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 1 });
  await prices.save({ id: "book-price", workspaceId: scope.workspaceId, productId: "book", unitAmount: { minorUnits: 1200, currency: "JPY" },
    status: "active", createdAt: clock.nowIso(), version: 1 });
  const receiver = createWebhookReceiver({ ...paymentDeps, endpoints: { resolve: async input =>
    input.siteId === scope.siteId && input.providerId === scope.providerId && input.endpointId === scope.mode ? scope : null } });
  const memberRepo = new InMemoryMemberRepo(), memberSessionRepo = new InMemoryMemberSessionRepo();
  for (const memberId of ["buyer", "foreign"]) {
    await memberRepo.save({ id: memberId, workspaceId: scope.workspaceId, email: `${memberId}@example.test`, status: "active",
      createdAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 1 });
    await memberSessionRepo.save({ id: `${memberId}-session`, workspaceId: scope.workspaceId, memberId,
      tokenHash: createHash("sha256").update(`${memberId}-token`).digest("hex"), createdAt: clock.nowIso(),
      expiresAt: new Date(now + 86_400_000).toISOString() });
  }
  const app = express();
  let base = "";
  registerPaymentsWebhookRoute({ app, deps: { resolveReceiver: () => receiver } }, { prefix: "/api" });
  app.use(express.json({ limit: "4kb" }));
  registerCommerceRoutes({ app, deps: { workspaceId: scope.workspaceId, clock, memberRepo, memberSessionRepo,
    commerce: { ...commerce, checkoutOrigin: async () => base } } });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (url: string, body?: unknown, member = "buyer") => fetch(base + url, {
    method: body === undefined ? "GET" : "POST", headers: { cookie: `tovu_member_session=${member}-token`, origin: base, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const signed = ({ id, type, paid }: { id: string; type: string; paid: boolean }) => {
    const raw = Buffer.from(` ${JSON.stringify({ id, type, created: Math.floor(now / 1000), livemode: false,
      data: { object: { ...session, status: "complete", payment_status: paid ? "paid" : "unpaid" } } })}\n`);
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.`).update(raw).digest("hex");
    return { raw, signature: `t=${timestamp},v1=${signature}` };
  };
  const deliver = ({ raw, signature }: ReturnType<typeof signed>) => fetch(`${base}/api/payments/webhooks/site/stripe/test`, {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: raw,
  });
  return { kernel, ledger, payments, paymentDeps, settle, requests, request, signed, deliver,
    worker: createInboxWorker(paymentDeps), advance: () => { now += 1000; },
    pending: () => ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) }) };
}

for (const dialect of ["sqlite", "pglite", "postgres"] as const) {
  test(`[${dialect}] member purchase settles only from signed paid evidence and survives relay redelivery`, async t => {
    const f = await fixture(t, dialect);
    const created = await f.request(ordersPath, { priceId: "book-price", quantity: 2 });
    assert.equal(created.status, 201);
    const placed = await created.json() as { order: { id: string; status: string } };
    assert.equal(placed.order.status, "pending");
    const payPath = `${ordersPath}/${placed.order.id}/pay`;
    const firstResponse = await f.request(payPath, {});
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json() as CommerceOrderView;
    assert.equal(first.payment?.status, "requires_action");
    assert.deepEqual(first.payment?.amount, total);
    const repeated = await f.request(payPath, {});
    assert.equal(repeated.status, 200);
    assert.equal(((await repeated.json()) as CommerceOrderView).payment?.id, first.payment?.id);
    assert.equal(f.requests.length, 1, "duplicate clicks must reuse the saved intent");
    assert.equal((await f.request(payPath, {}, "foreign")).status, 404);
    for (const page of ["return", "cancel"]) {
      const forged = await f.request(`/commerce/${page}?orderId=${placed.order.id}&paid=true&session_id=forged`);
      assert.equal(forged.status, 200);
      assert.match(forged.headers.get("content-type") ?? "", /text\/html/);
      assert.match(await forged.text(), /data-order-status="pending"/);
    }
    const unpaid = f.signed({ id: "evt_unpaid", type: "checkout.session.completed", paid: false });
    const tampered = await f.deliver({ ...unpaid, raw: Buffer.concat([unpaid.raw, Buffer.from(" ")]) });
    assert.equal(tampered.status, 400, "webhook signature must cover exact pre-JSON bytes");
    assert.equal((await f.deliver(unpaid)).status, 200);
    assert.equal((await f.worker.runOnce({ limit: 10 })).applied, 1);
    assert.deepEqual(await f.pending(), []);
    const stillPending = await f.request(`${ordersPath}/${placed.order.id}`);
    assert.equal(((await stillPending.json()) as CommerceOrderView).order.status, "pending", "completed is not paid");
    f.advance();
    const paid = f.signed({ id: "evt_paid", type: "checkout.session.async_payment_succeeded", paid: true });
    assert.equal((await f.deliver(paid)).status, 200);
    assert.deepEqual(await (await f.deliver(paid)).json(), { received: 0, duplicates: 1, ignored: false });
    assert.equal((await f.worker.runOnce({ limit: 10 })).applied, 1);
    assert.equal((await f.payments.getPayment({ scope, paymentId: first.payment!.id }))?.status, "succeeded");
    const [outbox] = await f.pending();
    assert.ok(outbox);
    const awaitingProjection = await f.request(`${ordersPath}/${placed.order.id}`);
    assert.equal(((await awaitingProjection.json()) as CommerceOrderView).order.status, "pending");
    const projector = createOrderPaymentProjector({ deps: f.settle });
    const crashRelay = createOutboxRelay({ ledger: f.ledger, now: f.paymentDeps.now, publish: { publish: async ({ message }) => {
      await projector.handle({ message });
      throw new Error("fixture crash after durable projection, before relay acknowledgment");
    } } });
    assert.deepEqual(await crashRelay.runOnce({ limit: 10 }), { published: 0, stopped: true });
    const projected = await f.request(`${ordersPath}/${placed.order.id}`);
    assert.deepEqual([((await projected.json()) as CommerceOrderView).order.status, (await f.pending())[0]?.id], ["paid", outbox.id]);
    // Recreate the SQL adapter and consumer after the crash; no in-memory dedupe can hide a second write.
    const restartedLedger = sqlPaymentsLedger({ kernel: f.kernel });
    const restartedPayments = createPaymentsService({ ...f.paymentDeps, ledger: restartedLedger });
    const restartedProjector = createOrderPaymentProjector({ deps: { ...f.settle, payments: restartedPayments } });
    const restartedRelay = createOutboxRelay({ ledger: restartedLedger, now: f.paymentDeps.now,
      publish: { publish: async ({ message }) => { assert.equal(message.id, outbox.id); await restartedProjector.handle({ message }); } } });
    assert.deepEqual(await restartedRelay.runOnce({ limit: 10 }), { published: 1, stopped: false });
    assert.deepEqual(await f.pending(), []);
    assert.deepEqual(await (await f.deliver(paid)).json(), { received: 0, duplicates: 1, ignored: false });
    assert.equal((await f.worker.runOnce({ limit: 10 })).seen, 0);
    const final = await f.request(`${ordersPath}/${placed.order.id}`);
    const result = await final.json() as CommerceOrderView;
    assert.deepEqual([result.order.status, result.order.version, result.payment?.status, f.requests.length], ["paid", 2, "succeeded", 1]);
  });
}
