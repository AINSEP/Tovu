import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { listTables, type StorageKernel } from '@jini-ai/db/kernel';
import { commercePriceRepoFor, commerceProductRepoFor } from '@jini-ai/commerce/repo';
import { sqlPaymentsLedger } from '@jini-ai/commerce/payments/ledger/sql';
import { leasedProviderItem, paymentsProviderContract, type LoadedProviderItem } from '@jini-ai/commerce/payments/kernel';
import { createPluginContributionCapture, createPluginContributionRegistry, createPluginProviderHost,
  type PluginManifest, type PluginSdk } from '@jini-ai/plugins/host';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '@jini-ai/platform/secrets/testing';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { createApiConnectionVault } from '#src/features/api-connections/vault-stores';
import { createAgentPluginStateStore } from '#src/features/api-connections/plugin-state';
import { agentPluginActivations } from '#src/features/agent-plugins/activation-effects';
import { openSqliteFileKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { openPgliteKernel } from '#src/platform/db/kernel/drivers/pglite';
import { composeCommerce, type ComposeCommerceRequired } from '../commerce.js';
import { ensureCommerceSetting, type CommerceConfiguration } from '../commerce-settings.js';
import { createVaultProviderConfigSource } from '../provider-config-source.js';

const configuration = { providerId: 'stripe', accountId: 'acct_fixture', mode: 'test' as const, publicOrigin: 'https://shop.example.test' };
const webhookSecret = 'whsec_composition_fixture_not_real';
type Runtime = ReturnType<typeof composeCommerce>;

async function provider() {
  const file = createRequire(import.meta.url).resolve('@jini-ai/provider-plugins/payments-stripe');
  const manifest = JSON.parse(await readFile(file, 'utf8')) as PluginManifest;
  const module = await import(pathToFileURL(path.join(path.dirname(file), 'server/index.mjs')).href) as {
    default: { definition: { setup(sdk: PluginSdk): void } };
  };
  const contributions = createPluginContributionRegistry({}), capture = createPluginContributionCapture({ manifest });
  const sdk = { providers: capture.providers } as PluginSdk;
  module.default.definition.setup(sdk); contributions.replace({ contributions: capture.seal({ sdk }) });
  const host = createPluginProviderHost({ contributions, contracts: [paymentsProviderContract] });
  const lease = await host.initialize({ contract: 'payments', id: 'stripe', input: {} });
  assert.ok(lease);
  const item = leasedProviderItem({ pluginId: 'payments-stripe', lease });
  assert.ok(!('problem' in item));
  return { host, item };
}

/** Bound only by a deadline; no product timer or private worker method is replaced. */
async function eventually<T>(read: () => Promise<T>, accepts: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  let value = await read();
  while (!accepts(value) && Date.now() < deadline) { await delay(20); value = await read(); }
  assert.ok(accepts(value), `composition did not reach the expected state: ${JSON.stringify(value)}`);
  return value;
}

/** Production composition with real activation owner, settings ledger, sealed provider settings and durable SQL. */
async function fixture(t: test.TestContext, dialect: 'sqlite' | 'pglite') {
  const root = await mkdtemp(path.join(os.tmpdir(), `commerce-compose-${dialect}-`));
  const { host, item } = await provider();
  let kernel: StorageKernel<unknown> | undefined, current: Runtime | undefined;
  t.after(async () => {
    try { await current?.close(); await kernel?.close(); await host.dispose({}); }
    finally { await rm(root, { recursive: true, force: true }); }
  });
  const open = () => dialect === 'sqlite'
    ? openSqliteFileKernel<unknown>(path.join(root, 'content.db'))
    : openPgliteKernel<unknown>({ dataDir: path.join(root, 'content-pg') });
  kernel = open();
  const clock = { nowMs: () => 1_800_000_000_000 };
  let sequence = 0;
  const idGen = { newId: () => { sequence += 1; return `composition_${sequence}`; } };
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids: idGen, principals: { findActiveById: async () => null } };
  await ensureCommerceSetting({ deps: settingsDeps, systemPrincipalId: 'commerce-boot' });
  const write = (value: CommerceConfiguration) => set({ deps: { ...settingsDeps, repo: settingsRepo,
    authorize: async () => ({ allowed: true, reason: 'fixture-owner' }) }, input: { namespace: 'core.commerce', key: 'configuration',
    scope: 'workspace', workspaceId: 'shop', value: { ...value }, callerPrincipalId: 'fixture-owner' } });
  const keyring = new InMemoryKeyring({ hkdfSalt: 'commerce-composition-fixture' });
  const vault = createApiConnectionVault({ repo: new InMemoryVaultRepo({}), keyring,
    sealer: new AesGcmSecretSealer({ keyring }), clock, workspaceId: 'shop' });
  const state = createAgentPluginStateStore({ vault, workspaceId: 'shop' });
  const providerConfig = createVaultProviderConfigSource({ state, workspaceId: 'shop', scope: 'site' });
  const activation = (enabled: boolean) => agentPluginActivations.setAgentPluginActivation({ workspaceRoot: root,
    pluginId: 'commerce', enabled, actor: 'fixture-owner' }, { origin: 'bundled' });
  await activation(false);
  const warnings: string[] = [], requests: string[] = [];
  let slots: readonly LoadedProviderItem[] = [item];
  const session = { object: 'checkout.session', id: 'cs_composition', mode: 'payment', livemode: false, amount_total: 1200,
    currency: 'jpy', status: 'open', payment_status: 'unpaid', metadata: { jini_payment_id: '' }, url: 'https://checkout.stripe.com/c/composition' };
  const httpClient: ComposeCommerceRequired['httpClient'] = { send: async ({ request }) => {
    requests.push(request.url);
    assert.equal(request.method, 'POST');
    assert.equal(request.url, 'https://api.stripe.com/v1/checkout/sessions');
    const form = new URLSearchParams(request.body as string);
    session.metadata.jini_payment_id = form.get('metadata[jini_payment_id]')!;
    assert.equal(new URL(form.get('success_url')!).origin, configuration.publicOrigin);
    return { status: 200, headers: {}, bodyText: JSON.stringify(session) };
  } };
  const boot = (workerOwner = true) => {
    current = composeCommerce({ kernel: kernel!, workerOwner, workerDirectory: root, workspaceRoot: root,
      workspaceId: 'shop', siteId: 'site', settingsRepo, settingsReady: Promise.resolve(), providerConfig,
      providers: { paymentProviders: () => slots }, httpClient, clock, idGen }, { warn: message => warnings.push(message) });
    return current;
  };
  const stop = async () => { await current?.close(); current = undefined; };
  const reopen = async () => { await stop(); await kernel!.close(); kernel = open(); };
  const sign = () => {
    const rawBody = Buffer.from(` ${JSON.stringify({ id: 'evt_composition_paid', type: 'checkout.session.async_payment_succeeded',
      created: clock.nowMs() / 1000, livemode: false, data: { object: { ...session, status: 'complete', payment_status: 'paid' } } })}\n`);
    const timestamp = Math.floor(clock.nowMs() / 1000);
    const digest = createHmac('sha256', webhookSecret).update(`${timestamp}.`).update(rawBody).digest('hex');
    return { rawBody, headers: { 'stripe-signature': `t=${timestamp},v1=${digest}` } };
  };
  const saveProvider = (accountId = configuration.accountId, mode: 'test' | 'live' = 'test') => providerConfig.write({ pluginId: 'payments-stripe',
    config: { settings: { accountId }, secrets: { [`${mode}_secretKey`]: 'sk_test_composition_fixture_not_real', [`${mode}_webhookSecret`]: webhookSecret } } });
  return { boot, stop, reopen, activation, write, saveProvider, providerConfig, sign, requests, warnings,
    kernel: () => kernel!, detach: () => { slots = []; }, attach: () => { slots = [item]; } };
}

for (const dialect of ['sqlite', 'pglite'] as const) {
  test(`[${dialect}] host composition stays dormant, guards configuration, and drains original payments across disabled restart`, async t => {
    const f = await fixture(t, dialect);
    let runtime = f.boot();
    assert.equal((await runtime.commerce.status()).ready, false);
    assert.deepEqual(await runtime.commerceCatalog.listProducts(), []);
    await f.stop();
    assert.deepEqual((await listTables(f.kernel())).filter(table => table.startsWith('commerce_')), []);
    await f.write(configuration); await f.activation(true);
    await f.saveProvider('acct_foreign');
    runtime = f.boot();
    await assert.rejects(runtime.commerce.activate(), /account and mode/);
    assert.equal((await runtime.commerce.status()).ready, false);
    await f.saveProvider(configuration.accountId, 'live');
    await assert.rejects(runtime.commerce.createOrder({ memberId: 'buyer', priceId: 'price' }), /account and mode/);
    assert.deepEqual(f.requests, []);
    await f.saveProvider();
    assert.equal((await runtime.commerce.activate()).ready, true);
    assert.ok((await listTables(f.kernel())).includes('commerce_products'));
    assert.ok((await listTables(f.kernel())).includes('commerce_payments'));
    const publicSettings = await f.providerConfig.readSettings({ pluginId: 'payments-stripe' });
    assert.deepEqual([...(publicSettings?.secretNames ?? [])].sort(), ['test_secretKey', 'test_webhookSecret']);
    assert.ok(!JSON.stringify(publicSettings).includes('sk_test_composition_fixture'));
    f.detach();
    await assert.rejects(runtime.commerce.createOrder({ memberId: 'buyer', priceId: 'price' }), /disabled, detached, or unavailable/);
    f.attach();
    const stamp = new Date(1_800_000_000_000).toISOString();
    await commerceProductRepoFor({ kernel: f.kernel() }).save({ id: 'book', workspaceId: 'shop', name: 'Book', slug: 'book', kind: 'one_time',
      status: 'active', createdAt: stamp, updatedAt: stamp, version: 1 });
    await commercePriceRepoFor({ kernel: f.kernel() }).save({ id: 'price', workspaceId: 'shop', productId: 'book',
      unitAmount: { minorUnits: 1200, currency: 'JPY' }, status: 'active', createdAt: stamp, version: 1 });
    const created = await runtime.commerce.createOrder({ memberId: 'buyer', priceId: 'price' });
    const paid = await runtime.commerce.pay({ memberId: 'buyer', orderId: created.order.id });
    assert.equal(paid.payment?.status, 'requires_action');
    assert.equal(f.requests.length, 1);
    await f.activation(false);
    await f.write({ ...configuration, accountId: 'acct_other', mode: 'live', publicOrigin: 'https://other.example.test' });
    await assert.rejects(runtime.commerce.createOrder({ memberId: 'buyer', priceId: 'price' }), { code: 'COMMERCE_UNAVAILABLE' });
    assert.equal((await runtime.commerce.readOrder({ memberId: 'buyer', orderId: created.order.id })).order.status, 'pending');
    await f.reopen();
    runtime = f.boot(false);
    await eventually(async () => { await runtime.commerce.status(); return runtime.commerce.resolveReceiver(); }, receiver => receiver !== null);
    assert.equal(await runtime.commerce.checkoutOrigin(), configuration.publicOrigin, 'unfinished work retains its original deployed origin');
    const receiver = runtime.commerce.resolveReceiver()!;
    const wrongMode = await receiver.resolveEndpoint({ path: { siteId: 'site', providerId: 'stripe', endpointId: 'live' } });
    assert.equal(wrongMode.ok, false);
    const endpoint = await receiver.resolveEndpoint({ path: { siteId: 'site', providerId: 'stripe', endpointId: 'test' } });
    assert.ok(endpoint.ok);
    assert.deepEqual(await receiver.receive({ endpoint: endpoint.endpoint, ...f.sign() }), { status: 200, body: { received: 1, duplicates: 0, ignored: false } });
    assert.equal((await runtime.commerce.readOrder({ memberId: 'buyer', orderId: created.order.id })).order.status, 'pending', 'non-owner composition does not run settlement');
    await f.stop();
    runtime = f.boot(true);
    const settled = await eventually(() => runtime.commerce.readOrder({ memberId: 'buyer', orderId: created.order.id }), view => view.order.status === 'paid');
    assert.deepEqual([settled.order.status, settled.order.version, settled.payment?.status, f.requests.length], ['paid', 2, 'succeeded', 1]);
    assert.deepEqual(await sqlPaymentsLedger({ kernel: f.kernel() }).transaction({ fn: tx => tx.listPendingOutbox({ limit: 10 }) }), []);
    assert.equal((await runtime.commerce.status()).ready, false);
    await assert.rejects(runtime.commerce.pay({ memberId: 'buyer', orderId: created.order.id }), { code: 'COMMERCE_UNAVAILABLE' });
    assert.ok(f.warnings.every(message => !message.includes('sk_test_') && !message.includes(webhookSecret)));
  });
}
