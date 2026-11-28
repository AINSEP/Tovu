import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';
import { InMemorySettingsRepo } from '@jini-ai/core/settings';
import { openMemorySqliteKernel } from '#src/platform/db/kernel/drivers/sqlite';

const failure = () => Object.assign(new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET'), { code: 'EIO' });
let paymentMigrations = 0; let paymentMigrationFailures = 0;
let workerRun: (() => Promise<void>) | undefined;
let activeFailure = false; let probeFailure = false; let configFailure = false; let ledgerFailure = false; let storageExists = false;
const database = await import('@jini-ai/db/kernel');
mock.module('@jini-ai/db/kernel', { namedExports: { ...database, tableExists: async () => { if (probeFailure) throw failure(); return storageExists; } } });
const activation = await import('@jini-ai/agent-plugins/site/activation-effects');
mock.module('@jini-ai/agent-plugins/site/activation-effects', { namedExports: { ...activation, createAgentPluginEnabledReader: () => async () => { if (activeFailure) throw failure(); return false; } } });
const repo = await import('@jini-ai/commerce/repo');
mock.module('@jini-ai/commerce/repo', { namedExports: { ...repo, commerceStorefrontFor: () => ({
  listProducts: async () => { throw failure(); }, findProduct: async () => { throw failure(); },
}) } });
const sql = await import('@jini-ai/commerce/payments/ledger/sql');
mock.module('@jini-ai/commerce/payments/ledger/sql', { namedExports: { ...sql,
  migrateCommercePayments: async () => { paymentMigrations += 1; if (paymentMigrationFailures > 0) { paymentMigrationFailures -= 1; throw failure(); } }, sqlPaymentsLedger: () => ({ transaction: async () => { if (ledgerFailure) throw failure(); return false; } }),
} });
const drain = await import('../commerce-drain.js');
mock.module(new URL('../commerce-drain.js', import.meta.url).href, { namedExports: { ...drain, readCommerceDrain: async () => null } });
const worker = await import('../commerce-worker.js');
mock.module(new URL('../commerce-worker.js', import.meta.url).href, { namedExports: { ...worker, createCommerceWorker: (options: { run: () => Promise<void> }) => { workerRun = options.run; return { kick: async () => {}, close: async () => {} }; } } });
const settings = await import('@jini-ai/commerce');
mock.module('@jini-ai/commerce', { namedExports: { ...settings, readCommerceConfiguration: async () => { if (configFailure) throw failure(); return null; } } });
const paymentsKernel = await import('@jini-ai/commerce/payments/kernel');
type InboxWorkerArgs = Parameters<typeof paymentsKernel.createInboxWorker>;
let capturedAlerts: NonNullable<InboxWorkerArgs[1]>['alerts'] | undefined;
mock.module('@jini-ai/commerce/payments/kernel', { namedExports: { ...paymentsKernel, createInboxWorker: (...args: InboxWorkerArgs) => {
  capturedAlerts = args[1]?.alerts; return paymentsKernel.createInboxWorker(...args);
} } });
const capturedAlertPort = () => capturedAlerts;
const { composeCommerce } = await import('../commerce.js');

function reset() { paymentMigrations = 0; paymentMigrationFailures = 0; workerRun = undefined; activeFailure = false; probeFailure = false; configFailure = false; ledgerFailure = false; storageExists = false; }
function fixture(t: TestContext) {
  const kernel = openMemorySqliteKernel<unknown>();
  const warnings: string[] = [];
  const runtime = composeCommerce({ kernel, workerOwner: false, workerDirectory: '/tmp', workspaceId: 'ws', siteId: 'site', workspaceRoot: '/tmp',
    settingsRepo: new InMemorySettingsRepo(), settingsReady: Promise.resolve(), providers: { paymentProviders: () => [] },
    providerConfig: { read: async () => null } as unknown as Parameters<typeof composeCommerce>[0]['providerConfig'],
    httpClient: { send: async () => { throw new Error('unexpected network'); } }, clock: { nowMs: () => 0 }, idGen: { newId: () => 'id' },
  }, { warn: message => warnings.push(message) });
  t.after(async () => { await runtime.close(); await kernel.close(); });
  return { runtime, warnings };
}
const settled = () => new Promise<void>(resolve => setImmediate(resolve));
function redacted(line: string | undefined) {
  assert.match(line ?? '', /boom/);
  assert.match(line ?? '', /commerce\.errors\.unit\.test\.ts/);
  assert.doesNotMatch(line ?? '', /SECRETSECRETSECRETSECRET/);
}

test('unreadable activation warns once with a redacted cause', async t => {
  reset(); activeFailure = true;
  const { runtime, warnings } = fixture(t); await settled();
  assert.equal((await runtime.commerce.storefrontStatus()).active, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Commerce activation cannot be confirmed/);
  redacted(warnings[0]);
});

test('warmup failure keeps the site online and logs a redacted cause', async t => {
  reset(); probeFailure = true;
  const { warnings } = fixture(t); await settled();
  const warning = warnings.find(line => line.includes('Commerce is unavailable; the rest of the site remains online.'));
  redacted(warning);
});

test('failed catalog reads keep their empty results and log redacted causes', async t => {
  reset(); const { runtime, warnings } = fixture(t); await settled();
  const options = { readiness: { active: true, ready: true } };
  assert.deepEqual(await runtime.commerceCatalog.listProducts({}, options).catch(() => 'rejected'), []);
  assert.equal(await runtime.commerceCatalog.findProduct({ idOrSlug: 'item' }, options).catch(() => 'rejected'), null);
  const catalog = warnings.filter(line => line.includes('The catalog is unavailable'));
  assert.equal(catalog.length, 2);
  catalog.forEach(redacted);
});

test('configuration read failure retains the status refusal and a safe diagnostic', async t => {
  reset(); const logs = t.mock.method(console, 'warn', () => {});
  const { runtime } = fixture(t); await settled(); configFailure = true;
  const status = await runtime.commerce.status();
  assert.match(status.reason ?? '', /Commerce configuration could not be read/);
  const entry = logs.mock.calls.find(call => String(call.arguments[0]).includes('Commerce configuration could not be read'));
  assert.ok(entry, 'configuration failure is logged'); assert.match(String(entry.arguments[1]), /Error.*EIO/);
  assert.doesNotMatch(JSON.stringify(entry.arguments), /boom|SECRETSECRETSECRETSECRET/);
});

test('attention scan failure retains the status refusal and a safe diagnostic', async t => {
  reset(); storageExists = true; const logs = t.mock.method(console, 'warn', () => {});
  const { runtime } = fixture(t); await settled(); ledgerFailure = true;
  const status = await runtime.commerce.status();
  assert.match(status.reason ?? '', /Commerce configuration could not be read/);
  const entry = logs.mock.calls.find(call => String(call.arguments[0]).includes('Commerce status could not be read'));
  assert.ok(entry, 'attention scan failure is logged'); assert.match(String(entry.arguments[1]), /Error.*EIO/);
  assert.doesNotMatch(JSON.stringify(entry.arguments), /boom|SECRETSECRETSECRETSECRET/);
});

test('payment alerts are warned once per payment and the dedupe memory forgets only the oldest past 1000 entries', async t => {
  reset(); capturedAlerts = undefined; const { warnings } = fixture(t); await settled();
  const alerts = capturedAlertPort(); assert.ok(alerts, 'the composition hands its alert port to the inbox worker');
  const raise = (n: number) => alerts.raise({ alert: { kind: 'unknown-aged', workspaceId: 'ws', mode: 'test', paymentId: `pay-${n}`, detail: 'aged' } });
  const settlement = () => warnings.filter(line => line.startsWith('Payment settlement needs attention: '));
  await raise(1); await raise(1);
  assert.deepEqual(settlement(), ['Payment settlement needs attention: {"kind":"unknown-aged","workspaceId":"ws","mode":"test","paymentId":"pay-1","detail":"aged"}']);
  for (let n = 2; n <= 1000; n += 1) await raise(n);
  assert.equal(settlement().length, 1000);
  await raise(1001); // the 1001st distinct alert evicts pay-1, the longest-held entry
  await raise(2); await raise(1000); await raise(1001);
  assert.equal(settlement().length, 1001, 'pay-2, pay-1000 and pay-1001 are still remembered');
  await raise(1);
  assert.equal(settlement().length, 1002);
  assert.equal(settlement().at(-1), 'Payment settlement needs attention: {"kind":"unknown-aged","workspaceId":"ws","mode":"test","paymentId":"pay-1","detail":"aged"}');
});

test('a payment migration that fails during warmup is retried on the next worker cycle instead of replaying the old failure', async t => {
  reset(); storageExists = true; paymentMigrationFailures = 1;
  const { warnings } = fixture(t); await settled(); await settled();
  redacted(warnings.find(line => line.includes('Commerce is unavailable; the rest of the site remains online.')));
  assert.equal(paymentMigrations, 1);
  const run = workerRun; assert.ok(run, 'the composition hands its cycle to the settlement worker');
  // The stubbed ledger cannot serve the inbox step that follows, so the cycle may still fail there; it must not fail on the old migration error.
  const outcome = await run().then(() => 'completed', (error: unknown) => String(error));
  assert.equal(paymentMigrations, 2, 'the failed migration is attempted again');
  assert.doesNotMatch(outcome, /boom/);
});
