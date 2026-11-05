import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
