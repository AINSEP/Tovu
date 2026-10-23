import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { createSiteConsentConfig, createSiteConsentReadiness, ensureSiteConsentDefinitions, SITE_CONSENT_DEFAULTS, SITE_CONSENT_NAMESPACE, SITE_CONSENT_OFF } from '../settings.js';
import { createSiteConsentRequestPorts } from '../host.js';
import { ensureSettingsUiTabDefinitions } from '../../webmcp/settings.js';

const clock = { nowMs: () => Date.parse('2026-10-09T12:00:00.000Z'), nowIso: () => '2026-10-09T12:00:00.000Z' };

async function ledger({ register = true }: { register?: boolean } = {}) {
  const settingsRepo = new InMemorySettingsRepo();
  let counter = 0;
  const ids = { newId: () => `consent-test-${++counter}` };
  const principals = { findActiveById: async ({ id }: { id: string }) => ({ id }) };
  const deps = { settingsRepo, clock, ids, principals };
  if (register) await ensureSiteConsentDefinitions(deps, { systemPrincipalId: 'system-test' });
  const write = (key: string, value: boolean | string) => set({ deps: { repo: settingsRepo, clock, ids, principals, authorize: async () => ({ allowed: true, reason: 'test' }) }, input: { namespace: SITE_CONSENT_NAMESPACE, key, value, scope: 'workspace', workspaceId: 'site-a', callerPrincipalId: 'owner' } });
  return { deps, settingsRepo, write };
}

/** Simulate an out-of-band persisted value; ordinary settings writes reject malformed schemas. */
async function persistUnchecked(settingsRepo: InMemorySettingsRepo, key: string, value: string | boolean | number) {
  const definition = await settingsRepo.findActiveDefinition({ namespace: SITE_CONSENT_NAMESPACE, key, workspaceId: null });
  assert.ok(definition);
  await settingsRepo.saveWorkspaceValue({
    settingId: definition.settingId, scope: 'workspace', workspaceId: 'site-a', principalId: null,
    valueJson: value, state: 'set', defVersion: definition.version, seq: 0,
    updatedBy: 'external-writer', updatedAt: clock.nowIso(), originPluginId: null,
  });
}

test('enabled consent falls back for definitions missing during a partial registration', async () => {
  const { settingsRepo, write } = await ledger();
  await write('enabled', true);
  const definitions = (await settingsRepo.listActiveDefinitions({ workspaceId: null })).filter(definition => definition.key === 'enabled');
  const partial = new InMemorySettingsRepo({ definitions, workspaceValues: await settingsRepo.listWorkspaceValues({ workspaceId: 'site-a' }) });
  assert.deepEqual(await createSiteConsentConfig({ settingsRepo: partial, workspaceId: 'site-a' }, {}).get({}, {}), { ...SITE_CONSENT_DEFAULTS, enabled: true });
});

test('a malformed persisted enabled flag is refused instead of enabling or disabling consent', async () => {
  const { settingsRepo } = await ledger();
  await persistUnchecked(settingsRepo, 'enabled', 'true');
  await assert.rejects(createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), { message: 'Invalid cookie consent setting: enabled.' });
});

test('a persisted copy value with the wrong type fails visibly', async () => {
  const { settingsRepo, write } = await ledger();
  await write('enabled', true);
  await persistUnchecked(settingsRepo, 'title', 42);
  await assert.rejects(createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), { message: 'Invalid cookie consent setting: title.' });
});

test('an unknown persisted region mode is refused', async () => {
  const { settingsRepo, write } = await ledger();
  await write('enabled', true);
  await persistUnchecked(settingsRepo, 'regionMode', 'unknown');
  await assert.rejects(createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), { message: 'Choose automatic, opt-in, or opt-out cookie consent region mode.' });
});

test('explicit opt-in mode is returned without replacing it with the automatic default', async () => {
  const { settingsRepo, write } = await ledger();
  await write('enabled', true);
  await write('regionMode', 'opt-in');
  assert.deepEqual(await createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), { ...SITE_CONSENT_DEFAULTS, enabled: true, regionMode: 'opt-in' });
});

test('a policy version beyond 128 characters is refused even within the general copy limit', async () => {
  const { settingsRepo, write } = await ledger();
  await write('enabled', true);
  await write('policyVersion', 'v'.repeat(129));
  await assert.rejects(createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), { message: 'Cookie consent policy version must contain 1–128 characters.' });
});

test('all sites default ON through the existing ledger and isolate explicit site choices', async () => {
  const { deps, settingsRepo, write } = await ledger();
  const before = await settingsRepo.maxRevisionSeq();
  await ensureSiteConsentDefinitions(deps, { systemPrincipalId: 'system-test' });
  assert.equal(await settingsRepo.maxRevisionSeq(), before);
  const config = createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' });
  assert.deepEqual(await config.get({}), SITE_CONSENT_DEFAULTS);
  await write('enabled', true); await write('privacyPolicyUrl', '/legal/privacy'); await write('regionMode', 'opt-out'); await write('message', 'Our policy text.');
  assert.deepEqual(await config.get({}), { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/legal/privacy', regionMode: 'opt-out', message: 'Our policy text.' });
  assert.deepEqual(await createSiteConsentConfig({ settingsRepo, workspaceId: 'site-b' }).get({}), SITE_CONSENT_DEFAULTS);
  await assert.rejects(write('regionMode', 'invalid'));
});

test('WebMCP bootstrap does not own or register public consent settings', async () => {
  const { deps, settingsRepo, write } = await ledger({ register: false });
  await ensureSettingsUiTabDefinitions(deps, { systemPrincipalId: 'system-test' });
  assert.equal(await settingsRepo.findActiveDefinition({ namespace: SITE_CONSENT_NAMESPACE, key: 'enabled', workspaceId: null }), null);
  assert.deepEqual(await createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get({}), SITE_CONSENT_DEFAULTS);
  await assert.rejects(write('enabled', true));
});

test('invalid enabled copy fails visibly, but disabling remains a safe rollback', async () => {
  const { settingsRepo, write } = await ledger();
  const config = createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' });
  await write('enabled', true); await write('policyVersion', '');
  await assert.rejects(config.get({}), { message: 'Cookie consent policy version must contain 1–128 characters.' });
  await write('policyVersion', '1'); await write('message', 'x'.repeat(2001));
  await assert.rejects(config.get({}), { message: 'Cookie consent setting message exceeds 2000 characters.' });
  await write('enabled', false);
  assert.deepEqual(await config.get({}), SITE_CONSENT_OFF);
});

test('request ports ignore region headers until configured and parse malformed cookies without throwing', async () => {
  const checked: string[] = [];
  const rateLimiter = { check: async ({ key }: { key: string }) => { checked.push(key); return { allowed: true as const }; } };
  const request = { get: (header: string) => header === 'x-trusted-region' ? 'US-CA' : undefined, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as Request;
  const ports = createSiteConsentRequestPorts({ origin: () => 'https://site.example/path', rateLimiter });
  assert.equal(ports.region({ request }), null); assert.equal(ports.origin({ request }), 'https://site.example');
  assert.equal(ports.readReceiptId({ cookieHeader: 'jini_consent=%E0%A4%A' }), null);
  assert.equal(ports.readReceiptId({ cookieHeader: 'jini_consent=receipt_01234567890123456789' }), 'receipt_01234567890123456789');
  assert.equal(ports.readReceiptId({ cookieHeader: 'jini_consent=../escape' }), null);
  assert.equal(createSiteConsentRequestPorts({ origin: () => 'https://site.example', trustedRegionHeader: 'x-trusted-region', rateLimiter }).region({ request }), 'US-CA');
  assert.equal(await ports.allowWrite({ request }), true); assert.deepEqual(checked, ['127.0.0.1']);
});


test('consent request ports use the injected platform rate-key owner after trusted IP resolution', async () => {
  const keys: string[] = [];
  const seen: string[] = [];
  const request = { ip: '2001:db8:1:2::123', socket: { remoteAddress: '127.0.0.1' } } as Request;
  const ports = createSiteConsentRequestPorts({ origin: () => 'https://site.example', rateLimiter: { check: async ({ key }) => { keys.push(key); return { allowed: true as const }; } }, rateLimitKey: ({ address }) => { seen.push(address); return '2001:db8:1:2::/64'; } });
  assert.equal(await ports.allowWrite({ request }), true);
  assert.deepEqual(seen, ['2001:db8:1:2::123']); assert.deepEqual(keys, ['2001:db8:1:2::/64']);
});

test('a configured region header missing from the request yields an unknown region', () => {
  const ports = createSiteConsentRequestPorts({
    origin: () => 'https://site.example', trustedRegionHeader: 'x-trusted-region',
    rateLimiter: { check: async () => ({ allowed: true as const }) },
  }, {});
  const request = { get: () => undefined, ip: '127.0.0.1' } as unknown as Request;

  assert.equal(ports.region({ request }, {}), null);
});

test('a request without a consent cookie has no receipt', () => {
  const ports = createSiteConsentRequestPorts({
    origin: () => 'https://site.example', rateLimiter: { check: async () => ({ allowed: true as const }) },
  });

  assert.equal(ports.readReceiptId({ cookieHeader: 'session=unrelated' }, {}), null);
  assert.equal(ports.readReceiptId({ cookieHeader: '' }), null);
});


test('consent has independent readiness after the shared ledger boot and cannot reject WebMCP readiness', async () => {
  const { deps, settingsRepo, write } = await ledger({ register: false });
  let release!: () => void;
  const after = new Promise<void>(resolve => { release = resolve; });
  const ready = createSiteConsentReadiness({ ...deps, after, systemPrincipalId: 'system-test' });
  assert.deepEqual(await createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get({}), SITE_CONSENT_DEFAULTS);
  release(); await ready;
  await write('enabled', true);
  assert.equal((await createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get({})).enabled, true);
  const webmcp = Promise.resolve();
  const fresh = await ledger({ register: false });
  // Definition registration writes the ledger directly; principal lookup belongs to value writes.
  class FailingSettingsRepo extends InMemorySettingsRepo {
    override async saveDefinition(_record: Parameters<InMemorySettingsRepo['saveDefinition']>[0]): Promise<void> {
      throw new Error('Consent registration failure');
    }
  }
  const failed = createSiteConsentReadiness({ ...fresh.deps, settingsRepo: new FailingSettingsRepo(), after: webmcp, systemPrincipalId: 'system-test' }, {
    ensurePrivacyDefaults: async () => assert.fail('definition registration must remain the gate'),
  });
  await assert.rejects(failed, { message: 'Consent registration failure' });
  await webmcp;
});

test('all no-choice sites default ON, including missing definitions', async () => {
  for (const register of [false, true]) {
    const { settingsRepo } = await ledger({ register });
    assert.deepEqual(await createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), SITE_CONSENT_DEFAULTS);
  }
});

test('the ledger default stays distinguishable from an explicit owner choice', async () => {
  const { settingsRepo } = await ledger();
  const definition = await settingsRepo.findActiveDefinition({ namespace: SITE_CONSENT_NAMESPACE, key: 'enabled', workspaceId: null });
  assert.equal(definition?.defaultValue, false);
});

test('explicit owner ON and OFF win over the product default', async () => {
  for (const enabled of [false, true]) {
    const { settingsRepo, write } = await ledger();
    await write('enabled', enabled);
    assert.deepEqual(await createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), {
      ...SITE_CONSENT_DEFAULTS, enabled,
    });
  }
});

test('enabled consent refuses an unknown banner placement', async () => {
  const { settingsRepo, write } = await ledger();
  await write('enabled', true);
  await persistUnchecked(settingsRepo, 'placement', 'unknown');
  await assert.rejects(createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' }).get(), {
    message: 'Choose a cookie banner placement: bottom-bar, bottom-left, bottom-right, top-bar.',
  });
});

test('policy versions reject whitespace and preserve exactly 128 characters without trimming', async () => {
  const { settingsRepo, write } = await ledger();
  await write('enabled', true);
  await write('policyVersion', '   ');
  const config = createSiteConsentConfig({ settingsRepo, workspaceId: 'site-a' });
  await assert.rejects(config.get(), { message: 'Cookie consent policy version must contain 1–128 characters.' });
  const version = ` ${'v'.repeat(126)} `;
  await write('policyVersion', version);
  await write('message', 'm'.repeat(2000));
  const settings = await config.get();
  assert.equal(settings.policyVersion, version);
  assert.equal(settings.message.length, 2000);
});

test('readiness registers definitions before privacy creation and awaits its completion', async () => {
  const { deps, settingsRepo } = await ledger({ register: false });
  let start!: () => void, finish!: () => void;
  const after = new Promise<void>(resolve => { start = resolve; });
  const contentReady = new Promise<void>(resolve => { finish = resolve; });
  let called = false, settled = false;
  const ready = createSiteConsentReadiness({ ...deps, after, systemPrincipalId: 'system-test' }, { ensurePrivacyDefaults: async () => {
    assert.ok(await settingsRepo.findActiveDefinition({ namespace: SITE_CONSENT_NAMESPACE, key: 'privacyPolicyUrl', workspaceId: null }));
    called = true; await contentReady;
  } });
  void ready.then(() => { settled = true; });
  assert.equal(called, false); start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(called, true); assert.equal(settled, false);
  finish(); await ready; assert.equal(settled, true);
});

test('privacy bootstrap failure is reported without blocking consent and retries on next open', async (t) => {
  const { deps } = await ledger();
  const failure = new Error('privacy bootstrap failed');
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  let attempts = 0;
  const options = { ensurePrivacyDefaults: async () => { if (++attempts === 1) throw failure; } };
  await createSiteConsentReadiness({ ...deps, after: Promise.resolve(), systemPrincipalId: 'system-test' }, options);
  assert.deepEqual(logged, [['[consent] privacy defaults failed: privacy bootstrap failed']]);
  assert.deepEqual(await createSiteConsentConfig({ settingsRepo: deps.settingsRepo, workspaceId: 'site-a' }).get(), SITE_CONSENT_DEFAULTS);
  await createSiteConsentReadiness({ ...deps, after: Promise.resolve(), systemPrincipalId: 'system-test' }, options);
  assert.equal(attempts, 2);
  assert.equal(logged.length, 1);
});
