import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createContributionRegistry, type ToolContributor, type DerivedToolContributor } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { nativeToolMetadata } from '#src/contracts/core/tool-metadata/index';
import { installFirstPartyToolContributors } from '../tool-catalog-manifest.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sql } from 'kysely';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { createLipayFake, LIPAY_FAKE_SECRET } from '@jini-ai/commerce/payments/testkit';
import { commerceProductRepoFor, commercePriceRepoFor } from '@jini-ai/commerce/repo';
import { sqlPaymentsLedger } from '@jini-ai/commerce/payments/ledger/sql';
import { openMemorySqliteKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { composeCommerce, type ComposeCommerceRequired } from '../commerce.js';
import { ensureCommerceSetting } from '../commerce-settings.js';
import type { ProviderConfigSource } from '../provider-config-source.js';

const context = { executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, signal: new AbortController().signal };
const authorize = async () => ({ allowed: true, reason: 'fixture-owner' });
const askHuman = async () => ({ confirmed: false as const, reason: 'declined' as const });

/** Real composition, SQL and fake payment provider; the fixture never contacts a vendor. */
async function fixture(t: test.TestContext, { active = true, configured = true } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'commerce-attention-'));
  const kernel = openMemorySqliteKernel<unknown>();
  let runtime: ReturnType<typeof composeCommerce> | undefined;
  t.after(async () => { await runtime?.close(); await kernel.close(); await rm(directory, { recursive: true, force: true }); });
  const activation = (value: boolean) => writeFile(path.join(directory, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { commerce: { enabled: value, origin: 'bundled', updatedAt: '2026-11-05T19:00:00.000Z', updatedBy: 'fixture' } } }));
  await activation(active);
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_800_000_000_000 }, idGen = { newId: () => randomUUID() };
  const deps = { settingsRepo, clock, ids: idGen, principals: { findActiveById: async () => null } };
  await ensureCommerceSetting({ deps, systemPrincipalId: 'fixture' });
  const write = (value: Record<string, string>) => set({ deps: { ...deps, repo: settingsRepo, authorize }, input: { namespace: 'core.commerce', key: 'configuration', workspaceId: 'workspace', scope: 'workspace', value, callerPrincipalId: 'owner' } });
  if (configured) await write({ providerId: 'lipay', accountId: 'merchant', mode: 'test', publicOrigin: 'https://shop.example' });
  const fake = createLipayFake({ now: clock.nowMs });
  const warnings: string[] = [];
  const ports: ComposeCommerceRequired = { kernel, workspaceId: 'workspace', siteId: 'site', workspaceRoot: directory,
    workerOwner: false, workerDirectory: directory, settingsRepo, settingsReady: Promise.resolve(), clock, idGen,
    providers: { paymentProviders: () => [{ pluginId: 'payments-fake', module: fake.provider }] },
    providerConfig: { read: async () => ({ settings: { accountId: 'merchant' }, secrets: { test_webhookSecret: LIPAY_FAKE_SECRET } }) } as unknown as ProviderConfigSource,
    httpClient: { send: async () => { throw new Error('no vendor network'); } },
  };
  const boot = (changes: Partial<ComposeCommerceRequired> = {}) => runtime = composeCommerce({ ...ports, ...changes }, { warn: message => warnings.push(message) });
  const stop = async () => { await runtime?.close(); runtime = undefined; };
  runtime = boot();
  const order = async () => {
    await runtime!.commerce.activate();
    const stamp = new Date(clock.nowMs()).toISOString();
    await commerceProductRepoFor({ kernel }).save({ id: 'product', workspaceId: 'workspace', name: 'Book', slug: 'book', kind: 'one_time', status: 'active', createdAt: stamp, updatedAt: stamp, version: 1 });
    await commercePriceRepoFor({ kernel }).save({ id: 'price', workspaceId: 'workspace', productId: 'product', unitAmount: { minorUnits: 1200, currency: 'USD' }, status: 'active', createdAt: stamp, version: 1 });
    const created = await runtime!.commerce.createOrder({ memberId: 'buyer', priceId: 'price' });
    return runtime!.commerce.pay({ memberId: 'buyer', orderId: created.order.id });
  };
  return { kernel, ports, boot, stop, order, write, activation, warnings, runtime: () => runtime!, ledger: sqlPaymentsLedger({ kernel }) };
}

async function attention(runtime: ReturnType<typeof composeCommerce>) {
  const statusTool = runtime.commerce.toolRegistrations({ authorize, askHuman }).find(tool => tool.descriptor.id === 'commerce_get_status')!;
  return await statusTool.handler({ ...context, input: {} }) as { checkout: { needsAttention: string[] } };
}

test('the real dormant runtime registers four tools and resolution refuses before absent-table storage', async t => {
  const f = await fixture(t, { active: false, configured: false });
  const tools = f.runtime().commerce.toolRegistrations({ authorize, askHuman });
  assert.deepEqual(tools.map(tool => tool.descriptor.id), ['commerce_get_status', 'commerce_resolve_unknown', 'commerce_create_product', 'commerce_create_price']);
  const resolution = tools.find(tool => tool.descriptor.id === 'commerce_resolve_unknown')!;
  assert.deepEqual(await resolution.handler({ ...context, input: { orderId: 'unknown-order', outcome: 'failed', reason: 'Provider verified no payment.' } }), {
    ok: false, reason: 'order-payment-not-found', message: 'No payment is recorded for this order in the current shop. Use the buyer’s original order link.',
  });
});

test('an active restart with removed settings still exposes the original late-webhook receiver', async t => {
  const f = await fixture(t);
  await f.order();
  await f.kernel.execute(sql`UPDATE commerce_payments SET intent_status='unknown',status='unknown'`);
  await f.kernel.execute(sql`UPDATE commerce_payment_attempts SET dispatch_json=${JSON.stringify({ returnUrl: 'https://shop.example/commerce/return' })}`);
  await f.stop(); await f.write({});
  const runtime = f.boot();
  await runtime.commerce.status();
  assert.ok(runtime.commerce.resolveReceiver(), 'existing payment storage must be probed on an active restart');
  assert.equal(await runtime.commerce.checkoutOrigin(), 'https://shop.example');
});

test('unknown payments are discoverable by order id with a ten-order bound', async t => {
  const f = await fixture(t);
  const ids: string[] = [];
  for (let index = 0; index < 12; index++) ids.push((await f.order()).order.id);
  await f.kernel.execute(sql`UPDATE commerce_payments SET intent_status='unknown',status='unknown'`);
  const status = await attention(f.runtime());
  assert.equal(status.checkout.needsAttention.length, 10);
  assert.ok(status.checkout.needsAttention.every(id => ids.includes(id)));
  assert.equal(new Set(status.checkout.needsAttention).size, 10);
});

test('blocked and not-succeeded projections remain quarantined after acknowledgement, with distinct payment alerts', async t => {
  const f = await fixture(t);
  const first = await f.order(), second = await f.order(), third = await f.order();
  await f.kernel.execute(sql`UPDATE commerce_orders SET total_amount_cents=1300,status='pending' WHERE id IN (${first.order.id},${second.order.id})`);
  await f.kernel.execute(sql`UPDATE commerce_payments SET status='refunded',refunded_minor=1200 WHERE id=${third.payment!.id}`);
  await f.activation(false); await f.stop();
  const runtime = f.boot({ workerOwner: true });
  await runtime.close();
  const quarantined = await f.ledger.transaction({ fn: tx => tx.listQuarantine({ workspaceId: 'workspace', mode: 'test' }) });
  assert.equal(quarantined.length, 3);
  assert.deepEqual(new Set(quarantined.map(row => row.paymentId)), new Set([first.payment!.id, second.payment!.id, third.payment!.id]));
  assert.ok(quarantined.every(row => JSON.parse(row.evidenceJson).reference));
  assert.deepEqual(await f.ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) }), []);
  for (const view of [first, second]) assert.ok(f.warnings.some(message => message.includes(view.payment!.id) && message.includes(view.order.id) && message.includes('amount')));
  const status = await attention(f.boot());
  assert.deepEqual(new Set(status.checkout.needsAttention), new Set([first.order.id, second.order.id, third.order.id]));
});


/** Observe real repository I/O; faults occur at the database write seam. */
function observedKernel(base: ComposeCommerceRequired['kernel'], observe: (method: string, table: string) => void) {
  return { ...base, run: (fn: Parameters<typeof base.run>[0]) => base.run(db => fn(new Proxy(db, {
    get(target, key) {
      if (key === 'selectFrom' || key === 'insertInto' || key === 'updateTable') return (table: string) => {
        observe(key, table); return (target[key] as (table: string) => unknown).call(target, table);
      };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    },
  }))) } as typeof base;
}

test('a quarantine storage fault leaves blocked settlement queued for redelivery', async t => {
  const f = await fixture(t);
  const paid = await f.order();
  await f.kernel.execute(sql`UPDATE commerce_orders SET total_amount_cents=1300,status='pending' WHERE id=${paid.order.id}`);
  await f.activation(false); await f.stop();
  let attempted = 0;
  const kernel = observedKernel(f.kernel, (method, table) => {
    if (method === 'insertInto' && table === 'commerce_quarantine') { attempted++; throw new Error('fixture quarantine unavailable'); }
  });
  await f.boot({ workerOwner: true, kernel }).close();
  assert.equal(attempted, 1);
  assert.equal((await f.ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) })).length, 1);
});

test('disabled draining checks payment migrations once across repeated worker cycles', async t => {
  const f = await fixture(t);
  await f.order(); await f.kernel.execute(sql`UPDATE commerce_payments SET intent_status='unknown',status='unknown'`);
  await f.activation(false); await f.stop();
  let migrationReads = 0;
  const kernel = observedKernel(f.kernel, (method, table) => {
    if (method === 'selectFrom' && table === 'commerce_payments_migrations') migrationReads++;
  });
  const runtime = f.boot({ workerOwner: true, kernel, providers: { paymentProviders: () => [] } });
  await delay(50);
  const afterWarm = migrationReads;
  await delay(5100);
  await runtime.close();
  assert.equal(afterWarm, 1);
  assert.equal(migrationReads, 1);
});

test('the real commerce card shows stored facts and decline writes no payment state', async t => {
  const f = await fixture(t);
  const paid = await f.order();
  await f.kernel.execute(sql`UPDATE commerce_payments SET intent_status='unknown',status='unknown' WHERE id=${paid.payment!.id}`);
  const contributions = { contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }) };
  installFirstPartyToolContributors({ contributions });
  const contributor = contributions.contributors.list({}).find(value => value.domain === 'commerce')!;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const tools = contributor.build({ authorize, commerce: f.runtime().commerce } as never, { surfaceExchanges: store });
  const tool = tools.find(value => value.descriptor.id === 'commerce_resolve_unknown')!;
  assert.equal(nativeToolMetadata.redeemableIds.has(tool.descriptor.id), true);
  const snapshot = () => f.kernel.query(sql`SELECT * FROM commerce_payments WHERE id=${paid.payment!.id}`);
  const before = await snapshot();
  let emitted!: (html: string) => void;
  const emission = new Promise<string>(resolve => { emitted = resolve; });
  const pending = tool.handler({ ...context, input: { orderId: paid.order.id, outcome: 'succeeded', reason: 'Verified at provider.' } }, {
    emitSurface: async surface => emitted((surface.payload as { resource: { resource: { text: string } } }).resource.resource.text),
  });
  const html = await Promise.race([emission, pending.then(result => { throw new Error(`resolution completed without card: ${JSON.stringify(result)}`); })]);
  for (const fact of [paid.order.id, paid.payment!.id, 'USD 12.00', 'test', 'succeeded']) assert.ok(html.includes(fact), fact);
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
  store.deliver({ exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'commerce_resolve_unknown' });
  assert.match(JSON.stringify(await pending), /declined/);
  assert.deepEqual(await snapshot(), before);
  const audit = await f.kernel.query(sql`SELECT * FROM commerce_operator_actions`);
  assert.deepEqual(audit, []);
});

test('a one-connection PostgreSQL pool refuses checkout before any order or payment write', async t => {
  const f = await fixture(t);
  const { openPostgresKernel } = await import('@jini-ai/db/kernel/postgres');
  class Pool {
    on() {}
    async connect(): Promise<never> { throw new Error('unit fixture must never reserve a PostgreSQL connection'); }
    async end() {}
  }
  const registered = openPostgresKernel<unknown>({ pg: { Pool, types: { getTypeParser: () => (value: string) => value } } as never,
    connectionString: 'postgres://unit-fixture' }, { max: 1 });
  // Preserve the real registered capacity while using the fixture SQL store for independent reads.
  Object.assign(registered, { dialect: f.kernel.dialect, run: f.kernel.run, transaction: f.kernel.transaction, query: f.kernel.query,
    execute: f.kernel.execute, lockKey: f.kernel.lockKey, ready: f.kernel.ready, inTransaction: f.kernel.inTransaction,
    require: f.kernel.require });
  t.after(() => registered.close());
  await f.stop();
  const runtime = f.boot({ kernel: registered });
  const status = await runtime.commerce.status();
  assert.equal(status.active, true);
  assert.equal(status.ready, false);
  assert.match(status.reason!, /pool.*at least 2/);
  await assert.rejects(runtime.commerce.createOrder({ memberId: 'buyer', priceId: 'price' }), /pool.*at least 2/);
  await assert.rejects(runtime.commerce.pay({ memberId: 'buyer', orderId: 'order' }), /pool.*at least 2/);
  assert.deepEqual(await f.kernel.query(sql`SELECT * FROM commerce_orders`), []);
  assert.deepEqual(await f.kernel.query(sql`SELECT * FROM commerce_payments`), []);
});


test('retry after a publish acknowledgement fault keeps one quarantine record', async t => {
  const f = await fixture(t);
  const paid = await f.order();
  await f.kernel.execute(sql`UPDATE commerce_orders SET total_amount_cents=1300,status='pending' WHERE id=${paid.order.id}`);
  await f.activation(false); await f.stop();
  const kernel = observedKernel(f.kernel, (method, table) => {
    if (method === 'updateTable' && table === 'commerce_outbox') throw new Error('fixture acknowledgement unavailable');
  });
  await f.boot({ workerOwner: true, kernel }).close();
  assert.equal((await f.ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) })).length, 1);
  assert.equal((await f.ledger.transaction({ fn: tx => tx.listQuarantine({ workspaceId: 'workspace', mode: 'test' }) })).length, 1);
  await f.boot({ workerOwner: true }).close();
  assert.deepEqual(await f.ledger.transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) }), []);
  assert.equal((await f.ledger.transaction({ fn: tx => tx.listQuarantine({ workspaceId: 'workspace', mode: 'test' }) })).length, 1);
});
