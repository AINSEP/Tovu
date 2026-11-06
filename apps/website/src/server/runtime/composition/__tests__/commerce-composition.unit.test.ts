import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sql } from 'kysely';
import { InMemorySettingsRepo } from '@jini-ai/core/settings';
import { openMemorySqliteKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { composeCommerce } from '../commerce.js';
import type { ProviderConfigSource } from '../provider-config-source.js';
import { ensureCommerceSetting } from '../commerce-settings.js';

/** Dormant host integration uses the real SQL kernel and settings ledger, with no vendor or network. */
test('commerce-off composes without catalog/payment SQL, merchant configuration, credentials or workers', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'commerce-off-'));
  const kernel = openMemorySqliteKernel<unknown>();
  t.after(async () => { await kernel.close(); await rm(directory, { recursive: true, force: true }); });
  await writeFile(path.join(directory, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { commerce: { enabled: false, origin: 'bundled', updatedAt: '2026-11-05T19:00:00.000Z', updatedBy: 'test' } } }));
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_800_000_000_000 }, idGen = { newId: () => randomUUID() };
  await ensureCommerceSetting({ deps: { settingsRepo, clock, ids: idGen, principals: { findActiveById: async () => null } }, systemPrincipalId: 'commerce-test' });
  let credentialReads = 0, providerReads = 0, httpCalls = 0;
  const runtime = composeCommerce({ kernel, workspaceId: 'workspace', siteId: 'site', workspaceRoot: directory,
    workerOwner: true, workerDirectory: directory, settingsRepo, settingsReady: Promise.resolve(), clock, idGen,
    providers: { paymentProviders: () => { providerReads++; return []; } },
    providerConfig: { read: async () => { credentialReads++; throw new Error('credentials must remain untouched'); } } as unknown as ProviderConfigSource,
    httpClient: { send: async () => { httpCalls++; throw new Error('no network'); } },
  });
  assert.deepEqual(await runtime.commerceCatalog.listProducts({}), []);
  const status = await runtime.commerce.status(); assert.equal(status.active, false); assert.equal(status.ready, false);
  assert.equal(runtime.commerce.resolveReceiver(), null);
  await runtime.close();
  assert.deepEqual(await kernel.query(sql`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'commerce_%'`), []);
  assert.equal(credentialReads, 0); assert.equal(providerReads, 0); assert.equal(httpCalls, 0);
});

test('disabled restart drains an outbox-only backlog even after merchant configuration was removed', async t => {
  const { migrateCommercePayments, sqlPaymentsLedger } = await import('@jini-ai/commerce/payments/ledger/sql');
  const directory = await mkdtemp(path.join(tmpdir(), 'commerce-drain-'));
  const kernel = openMemorySqliteKernel<unknown>();
  t.after(async () => { await kernel.close(); await rm(directory, { recursive: true, force: true }); });
  await writeFile(path.join(directory, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { commerce: { enabled: false, origin: 'bundled', updatedAt: '2026-11-05T19:00:00.000Z', updatedBy: 'test' } } }));
  await migrateCommercePayments({ kernel });
  const { migrateCommerceDatabase } = await import('#src/platform/db/migrations/index');
  await migrateCommerceDatabase({ kernel });
  const ledger = sqlPaymentsLedger({ kernel });
  await ledger.transaction({ fn: tx => tx.enqueueOutbox({ message: { id: 'backlog', workspaceId: 'workspace', mode: 'test',
    topic: 'refund.succeeded', aggregateId: 'historical-payment', payloadJson: '{}', createdAt: 1000 } }) });
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_800_000_000_000 }, idGen = { newId: () => randomUUID() };
  await ensureCommerceSetting({ deps: { settingsRepo, clock, ids: idGen, principals: { findActiveById: async () => null } }, systemPrincipalId: 'commerce-test' });
  let httpCalls = 0;
  const runtime = composeCommerce({ kernel, workspaceId: 'workspace', siteId: 'site', workspaceRoot: directory,
    workerOwner: true, workerDirectory: directory, settingsRepo, settingsReady: Promise.resolve(), clock, idGen,
    providers: { paymentProviders: () => [] }, providerConfig: { read: async () => null } as unknown as ProviderConfigSource,
    httpClient: { send: async () => { httpCalls++; throw new Error('no network'); } },
  }, { warn: () => {} });
  await runtime.close();
  assert.deepEqual(await ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) }), []);
  assert.equal(httpCalls, 0);
});

test('disabled payment-only restart preserves absent catalog and queued projection', async t => {
  const { migrateCommercePayments, sqlPaymentsLedger } = await import('@jini-ai/commerce/payments/ledger/sql');
  const directory = await mkdtemp(path.join(tmpdir(), 'commerce-drain-'));
  const kernel = openMemorySqliteKernel<unknown>();
  t.after(async () => { await kernel.close(); await rm(directory, { recursive: true, force: true }); });
  await writeFile(path.join(directory, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { commerce: { enabled: false, origin: 'bundled', updatedAt: '2026-11-05T19:00:00.000Z', updatedBy: 'test' } } }));
  await migrateCommercePayments({ kernel });
  const ledger = sqlPaymentsLedger({ kernel });
  await ledger.transaction({ fn: tx => tx.enqueueOutbox({ message: { id: 'backlog', workspaceId: 'workspace', mode: 'test',
    topic: 'refund.succeeded', aggregateId: 'historical-payment', payloadJson: '{}', createdAt: 1000 } }) });
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_800_000_000_000 }, idGen = { newId: () => randomUUID() };
  await ensureCommerceSetting({ deps: { settingsRepo, clock, ids: idGen, principals: { findActiveById: async () => null } }, systemPrincipalId: 'commerce-test' });
  let httpCalls = 0;
  const runtime = composeCommerce({ kernel, workspaceId: 'workspace', siteId: 'site', workspaceRoot: directory,
    workerOwner: true, workerDirectory: directory, settingsRepo, settingsReady: Promise.resolve(), clock, idGen,
    providers: { paymentProviders: () => [] }, providerConfig: { read: async () => null } as unknown as ProviderConfigSource,
    httpClient: { send: async () => { httpCalls++; throw new Error('no network'); } },
  }, { warn: () => {} });
  await runtime.close();
  assert.equal((await kernel.query(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='commerce_products'`)).length, 0);
  assert.equal((await ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) })).length, 1);
  assert.equal(httpCalls, 0);
});

test('activated SQL checkout binds original merchant scope, blocks foreign members and reads ledger truth after disable/config removal', async t => {
  const { createLipayFake, LIPAY_FAKE_SECRET } = await import('@jini-ai/commerce/payments/testkit');
  const { commerceProductRepoFor, commercePriceRepoFor } = await import('@jini-ai/commerce/repo');
  const { set } = await import('@jini-ai/core/settings');
  const directory = await mkdtemp(path.join(tmpdir(), 'commerce-checkout-'));
  const kernel = openMemorySqliteKernel<unknown>();
  let runtime: ReturnType<typeof composeCommerce> | undefined;
  t.after(async () => { await runtime?.close(); await kernel.close(); await rm(directory, { recursive: true, force: true }); });
  const activate = (enabled: boolean) => writeFile(path.join(directory, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { commerce: { enabled, origin: 'bundled', updatedAt: '2026-11-05T19:00:00.000Z', updatedBy: 'test' } } }));
  await activate(true);
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_800_000_000_000 }, idGen = { newId: () => randomUUID() };
  const deps = { settingsRepo, clock, ids: idGen, principals: { findActiveById: async () => null } };
  await ensureCommerceSetting({ deps, systemPrincipalId: 'commerce-test' });
  const write = (value: Record<string, string>) => set({ deps: { ...deps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: 'test' }) },
    input: { namespace: 'core.commerce', key: 'configuration', workspaceId: 'workspace', scope: 'workspace', value, callerPrincipalId: 'owner' } });
  await write({ providerId: 'lipay', accountId: 'merchant-original', mode: 'test', publicOrigin: 'https://shop.example:443/' });
  const fake = createLipayFake({ now: clock.nowMs });
  let credentialReads = 0;
  let creates = 0, returnUrl = '', webhookUrl = '';
  const provider = { ...fake.provider, createIntent: async (...args: Parameters<typeof fake.provider.createIntent>) => {
    creates++; returnUrl = args[0].ctx.returnUrl; webhookUrl = args[0].ctx.webhookUrl; return fake.provider.createIntent(...args);
  } };
  const ports = { kernel, workspaceId: 'workspace', siteId: 'site', workspaceRoot: directory,
    workerOwner: false, workerDirectory: directory, settingsRepo, settingsReady: Promise.resolve(), clock, idGen,
    providers: { paymentProviders: () => [{ pluginId: 'payments-fake', module: provider }] },
    providerConfig: { read: async () => { credentialReads++; return { settings: { accountId: 'merchant-original' }, secrets: { test_webhookSecret: LIPAY_FAKE_SECRET } }; } } as unknown as ProviderConfigSource,
    httpClient: { send: async () => { throw new Error('no network'); } },
  };
  runtime = composeCommerce(ports);
  await runtime.commerce.activate(); assert.equal((await runtime.commerce.status()).ready, true);
  assert.equal(await runtime.commerce.checkoutOrigin(), 'https://shop.example');
  const at = new Date(clock.nowMs()).toISOString();
  await commerceProductRepoFor({ kernel }).save({ id: 'product', workspaceId: 'workspace', name: 'Book', slug: 'book', kind: 'one_time', status: 'active', createdAt: at, updatedAt: at, version: 1 });
  await commercePriceRepoFor({ kernel }).save({ id: 'price', workspaceId: 'workspace', productId: 'product', unitAmount: { minorUnits: 1200, currency: 'JPY' }, status: 'active', createdAt: at, version: 1 });
  const blockedOrder = await runtime.commerce.createOrder({ memberId: 'buyer', priceId: 'price' });
  const ledger = (await import('@jini-ai/commerce/payments/ledger/sql')).sqlPaymentsLedger({ kernel });
  await ledger.transaction({ fn: tx => tx.enqueueOutbox({ message: { id: 'blocked-first', workspaceId: 'workspace', mode: 'test',
    topic: 'payment.succeeded', aggregateId: 'missing-association', payloadJson: JSON.stringify({ reference: blockedOrder.order.id }), createdAt: 0 } }) });
  const request = runtime.commerce.forRequest();
  const readsBeforeRequest = credentialReads;
  assert.equal(await request.checkoutOrigin(), 'https://shop.example');
  await request.activate();
  const checkout = await request.createOrder({ memberId: 'buyer', priceId: 'price' });
  assert.equal(credentialReads - readsBeforeRequest, 1, 'origin, admission and create share one provider readiness read per request');
  await assert.rejects(runtime.commerce.pay({ memberId: 'foreign-member', orderId: checkout.order.id })); assert.equal(creates, 0);
  const paid = await runtime.commerce.pay({ memberId: 'buyer', orderId: checkout.order.id });
  assert.equal(paid.order.status, 'paid'); assert.equal(paid.payment?.captured.minorUnits, 1200); assert.equal(creates, 1);
  assert.equal(returnUrl, `https://shop.example/commerce/return?orderId=${checkout.order.id}`);
  assert.equal(webhookUrl, 'https://shop.example/api/payments/webhooks/site/lipay/test');
  await runtime.commerce.pay({ memberId: 'buyer', orderId: checkout.order.id }); assert.equal(creates, 1);
  await activate(false); await write({});
  const read = await runtime.commerce.readOrder({ memberId: 'buyer', orderId: checkout.order.id });
  assert.equal(read.order.status, 'paid'); assert.equal(read.payment?.scope.providerAccountId, 'merchant-original'); assert.equal(read.intent, null);
  await assert.rejects(runtime.commerce.readOrder({ memberId: 'foreign-member', orderId: checkout.order.id }));
  assert.equal(creates, 1);
  // Drain the already-paid outbox, then restart idle/off with no pending work.
  await write({ providerId: 'lipay', accountId: 'merchant-original', mode: 'test', publicOrigin: 'https://shop.example' });
  // Model a process restart after ledger success, before durable order projection.
  await kernel.execute(sql`UPDATE commerce_orders SET status='pending',version=1 WHERE id=${checkout.order.id}`);
  await runtime.close(); runtime = composeCommerce({ ...ports, workerOwner: true }); await runtime.close();
  assert.equal((await runtime.commerce.readOrder({ memberId: 'buyer', orderId: checkout.order.id })).order.status, 'paid',
    'a blocked first message must not prevent the later valid payment from settling');
  assert.deepEqual(await ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) }), []);

  runtime = composeCommerce({ ...ports, workerOwner: true });
  await eventually(async () => runtime!.commerce.resolveReceiver() !== null);
  const statusTool = runtime.commerce.toolRegistrations({ authorize: async () => ({ allowed: true, reason: 'fixture-owner' }),
    askHuman: async () => ({ confirmed: false, reason: 'declined' }) }).find(tool => tool.descriptor.id === 'commerce_get_status')!;
  const attention = await statusTool.handler({ executionId: 'attention', input: {}, principal: { id: 'fixture-owner' },
    run: { id: 'run' }, signal: new AbortController().signal }) as { checkout: { needsAttention: string[] } };
  assert.ok(attention.checkout.needsAttention.includes(blockedOrder.order.id), 'a blocked event without a payment row still lists its shop-owned order');

  await eventually(async () => { try { await access(path.join(directory, 'commerce-worker.lock')); return false; } catch { return true; } });
  const receiver = runtime.commerce.resolveReceiver()!;
  const endpoint = await receiver.resolveEndpoint({ path: { siteId: 'site', providerId: 'lipay', endpointId: 'test' } });
  assert.equal(endpoint.ok, true);
  if (!endpoint.ok) throw new Error('configured endpoint missing');
  const [ledgerPayment] = await kernel.query<{ provider_ref: string }>(sql`SELECT provider_ref FROM commerce_payments WHERE id=${paid.payment!.id}`);
  assert.ok(ledgerPayment?.provider_ref);
  const delivery = fake.server.webhook({ type: 'charge.succeeded', id: ledgerPayment.provider_ref, eventId: 'late-off-event' });
  assert.equal((await receiver.receive({ endpoint: endpoint.endpoint, ...delivery })).status, 200);
  await eventually(async () => {
    const rows = await kernel.query<{ state: string }>(sql`SELECT state FROM commerce_webhook_inbox WHERE provider_event_id='late-off-event'`);
    return rows[0]?.state === 'applied';
  });
  assert.equal(creates, 1);
});

async function eventually(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 10));
  }
  assert.fail('background settlement did not reach its expected durable state');
}
