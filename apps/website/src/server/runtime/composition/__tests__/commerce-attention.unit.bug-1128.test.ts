import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { ensureCommerceSetting } from '@jini-ai/commerce';
import { createLipayFake } from '@jini-ai/commerce/payments/testkit';
import { commercePriceRepoFor, commerceProductRepoFor } from '@jini-ai/commerce/repo';
import { openMemorySqliteKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { composeCommerce, type ComposeCommerceRequired } from '../commerce.js';

test('BUG T-B05: shutdown lets in-flight payment reconciliation finish without an alert', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'commerce-drain-'));
  const kernel = openMemorySqliteKernel<unknown>();
  let runtime: ReturnType<typeof composeCommerce> | undefined;
  t.after(async () => { await runtime?.close(); await kernel.close(); await rm(directory, { recursive: true, force: true }); });
  await writeFile(path.join(directory, 'activations.json'), JSON.stringify({ schemaVersion: 1,
    plugins: { commerce: { enabled: true, origin: 'bundled', updatedAt: '2026-11-05T19:00:00.000Z', updatedBy: 'owner' } },
  }));
  let now = 1_800_000_000_000;
  const clock = { nowMs: () => now };
  let sequence = 0;
  const idGen = { newId: () => `id-${++sequence}` };
  const settingsRepo = new InMemorySettingsRepo();
  const deps = { settingsRepo, clock, ids: idGen, principals: { findActiveById: async () => null } };
  await ensureCommerceSetting({ deps, systemPrincipalId: 'owner' });
  await set({ deps: { ...deps, repo: settingsRepo, authorize: async () => ({ allowed: true, reason: 'fixture' }) }, input: {
    namespace: 'core.commerce', key: 'configuration', workspaceId: 'ws', scope: 'workspace', callerPrincipalId: 'owner',
    value: { providerId: 'lipay', accountId: 'merchant', mode: 'test', publicOrigin: 'https://shop.example' },
  } });

  const fake = createLipayFake({ now: clock.nowMs });
  const provider = { ...fake.provider, createIntent: async (...args: Parameters<typeof fake.provider.createIntent>) => {
    const outcome = await fake.provider.createIntent(...args);
    assert.equal(outcome.kind, 'ok');
    // The checkout sees pending. A later retrieval will return the fake's settled charge.
    return { ...outcome, value: { ...outcome.value, evidence: { ...outcome.value.evidence, status: 'pending' as const } } };
  } };
  const paymentProviders: ComposeCommerceRequired['providers']['paymentProviders'] = () => [{ pluginId: 'payments-fake', module: provider }];
  const ports: ComposeCommerceRequired = { kernel, workspaceId: 'ws', siteId: 'site', workspaceRoot: directory,
    workerOwner: false, workerDirectory: directory, settingsRepo, settingsReady: Promise.resolve(), clock, idGen,
    providers: { paymentProviders }, providerConfig: { scope: 'site', read: async ({ pluginId }) => {
      assert.equal(pluginId, 'payments-fake');
      return { settings: { accountId: 'merchant' }, secrets: { test_webhookSecret: 'tok-a' } };
    }, readSettings: async () => assert.fail('no summary read'), usage: async () => assert.fail('no credential usage read'),
    write: async () => assert.fail('no credential writes') }, httpClient: { send: async () => assert.fail('no vendor network') },
  };
  const warnings: string[] = [];
  const options = { warn: (message: string) => { warnings.push(message); } };
  runtime = composeCommerce(ports, options);
  await runtime.commerce.activate();
  const at = new Date(now).toISOString();
  await commerceProductRepoFor({ kernel }).save({ id: 'product', workspaceId: 'ws', name: 'Book', slug: 'book',
    kind: 'one_time', status: 'active', createdAt: at, updatedAt: at, version: 1 });
  await commercePriceRepoFor({ kernel }).save({ id: 'price', workspaceId: 'ws', productId: 'product',
    unitAmount: { minorUnits: 1200, currency: 'USD' }, status: 'active', createdAt: at, version: 1 });
  const { order } = await runtime.commerce.createOrder({ memberId: 'buyer', priceId: 'price' });
  const input = { memberId: 'buyer', orderId: order.id };
  assert.equal((await runtime.commerce.pay(input)).payment?.status, 'pending');
  await runtime.close();
  now += 16 * 60_000;

  let closing: Promise<void> | undefined;
  let notifyLookup!: () => void;
  const lookup = new Promise<void>(resolve => { notifyLookup = resolve; });
  runtime = composeCommerce({ ...ports, workerOwner: true, providers: { paymentProviders: required => {
    // Reconciliation has entered provider lookup but has not resolved payment context yet.
    closing ??= runtime!.close();
    notifyLookup();
    return paymentProviders(required);
  } } }, options);
  await lookup;
  await closing;

  const { payment } = await runtime.commerce.readOrder(input);
  assert.deepEqual({ payment: payment?.status, warnings }, { payment: 'succeeded', warnings: [] });
});
