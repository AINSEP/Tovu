/** @file Consent 1b public wiring: static/live split, boot failures and durable-proof failures. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { JSDOM } from 'jsdom';
import { registerConsentHttp } from '@jini-ai/cms/consent/express';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import { applySiteConsent, CONSENT_RECEIPTS_DIR_NAME, createPrivacyPageCheck, createSiteConsentPorts } from '../site-consent.js';
import { bindSiteConsentService } from '#src/server/runtime/composition/site-consent';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { ensureSiteConsentDefinitions, SITE_CONSENT_NAMESPACE } from '#src/features/consent/settings';
import { SITE_CONSENT_DEFAULT_CSS } from '#src/features/consent/config';

async function publicFixture({ t }: { t: import('node:test').TestContext }, _options = {}) {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const deps = createRouteDeps(); deps.consentStore = f.store;
  return { ...f, deps, revisionId: saved.revision.id };
}

test('live HTML is gated and static export returns 409 without changing the live delivery mode', async t => {
  const f = await publicFixture({ t }); const app = express();
  applySiteConsent({ app, deps: f.deps });
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body><script>window.optional=1</script></body></html>'));
  const base = await startTestServer(app, t);
  const exported = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(exported.status, 409);
  assert.equal(await exported.text(), 'Static export requires cookie consent to be disabled. Review optional scripts before exporting.');
  const live = await fetch(base); const html = await live.text();
  assert.equal(live.status, 200); assert.match(html, /data-jini-consent-script/);
  assert.match(html, /window.optional=1/); assert.equal(live.headers.get('cache-control'), 'private, no-store');
  const config = await createSiteConsentPorts({ deps: f.deps }).config.get({});
  assert.equal(config.policyVersion, `${f.config.policyVersion}:${f.revisionId}`);
});

test('live conditional requests cannot reuse ungated HTML unless consent is off', async t => {
  const f = await publicFixture({ t });
  const state = await f.store.read({});
  assert.ok(state?.published);
  const published = state.published;
  const disabledStore = { ...f.store, read: async () => ({ ...state, published: {
    ...published, config: { ...(published.config as object), enabled: false },
  } }) };
  f.deps.consentStore = disabledStore;
  const app = express(); applySiteConsent({ app, deps: f.deps });
  const original = '<html><head></head><body><script>window.optional=1</script></body></html>';
  const modified = 'Wed, 21 Oct 2026 12:00:00 GMT';
  app.get('/', (_req, res) => res.set({
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300', 'Last-Modified': modified,
  }).type('html').send(original));
  const base = await startTestServer(app, t);
  const ungated = await fetch(base);
  assert.equal(ungated.status, 200);
  assert.equal(await ungated.text(), original);
  const etag = ungated.headers.get('etag');
  assert.ok(etag, 'use the actual ETag generated for the ungated page');
  const validators: Record<string, string>[] = [
    { 'if-none-match': '*' },
    { 'if-none-match': etag },
    { 'if-modified-since': modified },
  ];
  for (const policy of ['off', 'on', 'unavailable'] as const) {
    f.deps.consentStore = policy === 'off' ? disabledStore : policy === 'on' ? f.store : {
      ...f.store, read: async () => { throw new Error('policy unavailable'); },
    };
    for (const method of ['GET', 'HEAD']) {
      for (const headers of validators) {
        // Default fetch adds no-cache with validators, which would hide Express's 304 behavior.
        const response = await fetch(base, { method, headers, cache: 'no-cache' });
        const html = await response.text();
        assert.equal(response.status, policy === 'off' ? 304 : 200, `${policy} ${method} ${JSON.stringify(headers)}`);
        if (policy === 'off') {
          assert.equal(response.headers.get('etag'), etag);
          assert.equal(response.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
        } else {
          assert.equal(response.headers.get('cache-control'), 'private, no-store');
          assert.equal(response.headers.get('etag'), null);
          if (method === 'GET') {
            const dom = new JSDOM(html);
            try {
              const document = dom.window.document;
              assert.ok(document.querySelector('#jini-consent'));
              assert.equal(document.querySelector('template[data-jini-consent-script]')?.innerHTML, '<script>window.optional=1</script>');
              assert.ok(![...document.querySelectorAll('script')].some(script => script.textContent === 'window.optional=1'));
            } finally { dom.window.close(); }
          }
        }
        if (method === 'HEAD' || policy === 'off') assert.equal(html, '');
      }
    }
  }
});

test('bootstrap or policy-store failure never returns ungated active HTML', async t => {
  const f = await publicFixture({ t });
  const failing = { ...f.store, read: async () => { throw new Error('sensitive persisted location'); } };
  f.deps.consentStore = failing;
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get('/', (_req, res) => res.type('html').send('<html><body><script>window.leaked=1</script></body></html>'));
  const base = await startTestServer(app, t); const html = await (await fetch(base)).text();
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.ok(![...document.querySelectorAll('script')].some(script => script.textContent === 'window.leaked=1'));
  assert.ok(!html.includes('sensitive persisted location'));
  dom.window.close();
});

test('cached OFF cannot bypass consent after publishing ON when the next policy read fails', async t => {
  const f = consentFixture({ t });
  const off = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled: false }, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: off.revision.id, expectedPublishedId: null });
  const deps = createRouteDeps(); deps.consentStore = f.store;
  const app = express(); applySiteConsent({ app, deps });
  const original = '<html><head></head><body><script>window.optional=1</script></body></html>';
  app.get('/', (_req, res) => res.type('html').send(original));
  const base = await startTestServer(app, t);
  assert.equal(await (await fetch(base)).text(), original);
  const on = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, regionMode: 'opt-out' }, expectedDraftId: off.revision.id });
  await f.service.publish({ principalId: 'owner', draftId: on.revision.id, expectedPublishedId: off.revision.id });
  deps.consentStore = { ...f.store, read: async () => { throw new Error('sensitive policy storage path'); } };
  const response = await fetch(base);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const dom = new JSDOM(html);
  try {
    const state = JSON.parse(dom.window.document.querySelector('#jini-consent-config')!.textContent!);
    assert.deepEqual(state.choices, { necessary: true, functional: false, analytics: false, marketing: false });
    assert.ok(dom.window.document.querySelector('template[data-jini-consent-script]'));
    assert.ok(![...dom.window.document.querySelectorAll('script')].some(script => script.textContent === 'window.optional=1'));
    assert.ok(!html.includes('sensitive policy storage path'));
  } finally { dom.window.close(); }
  const exported = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(exported.status, 409);
  assert.match(await exported.text(), /Static export requires/);
});

test('bound readiness counts the serving site receipts and blocks when that directory is unavailable', async t => {
  const f = await publicFixture({ t });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tovu-consent-health-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  f.deps.siteBinding = { ...f.deps.siteBinding, dir: directory };
  f.deps.authorize = f.ports.authorize;
  f.deps.siteTitleReady = Promise.resolve();
  f.deps.createSiteApp = () => {
    const app = express();
    app.get('/', (_req, res) => res.type('html').send('<html><head></head><body>Site</body></html>'));
    return app;
  };
  const service = bindSiteConsentService({ deps: f.deps });
  const config = { ...f.config, privacyPolicyUrl: 'https://site.example/privacy' };
  const empty = await service.readiness({ principalId: 'owner', config });
  assert.equal(empty.ready, true);
  assert.deepEqual(empty.receipts, { writable: true, count: 0 });
  const receipts = path.join(directory, CONSENT_RECEIPTS_DIR_NAME);
  await fs.writeFile(path.join(receipts, 'receipt_01234567890123456789.json'), '{}');
  assert.deepEqual((await service.readiness({ principalId: 'owner', config })).receipts, { writable: true, count: 1 });
  await fs.rm(receipts, { recursive: true });
  await fs.writeFile(receipts, 'a file cannot store receipt files');
  const failed = await service.readiness({ principalId: 'owner', config });
  assert.equal(failed.ready, false);
  assert.deepEqual(failed.receipts, { writable: false, count: null });
  assert.ok(failed.blockingProblems.some(problem => problem.code === 'RECEIPT_STORAGE_UNAVAILABLE'));
  assert.ok(!JSON.stringify(failed).includes(directory));
});

test('a receipt save failure issues no cookie; cross-origin posts are refused before saving', async t => {
  const f = await publicFixture({ t }); let writes = 0;
  const ports = createSiteConsentPorts({ deps: f.deps });
  ports.records = { read: async () => null, save: async () => { writes++; throw new Error('durability failure'); } };
  const app = express(); registerConsentHttp({ app, ports });
  const base = await startTestServer(app, t);
  const send = (origin: string) => fetch(`${base}/api/site-consent`, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ action: 'accept', policyVersion: `${f.config.policyVersion}:${f.revisionId}` }) });
  const foreign = await send('https://attacker.example'); assert.equal(foreign.status, 403); assert.equal(writes, 0);
  const failed = await send(base); assert.equal(failed.status, 500); assert.equal(failed.headers.get('set-cookie'), null); assert.equal(writes, 1);
});

test('a missing or malformed receipt in opt-out mode still denies optional categories', async t => {
  const f = await publicFixture({ t });
  const next = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, regionMode: 'opt-out' }, expectedDraftId: f.revisionId });
  await f.service.publish({ principalId: 'owner', draftId: next.revision.id, expectedPublishedId: f.revisionId });
  const ports = createSiteConsentPorts({ deps: f.deps });
  ports.records = { read: async () => null, save: async () => assert.fail('reading proof cannot write') };
  const app = express(); registerConsentHttp({ app, ports });
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body><script>window.optional=1</script></body></html>'));
  const base = await startTestServer(app, t);
  for (const cookie of ['jini_consent=short', 'jini_consent=missing_01234567890123456789']) {
    const html = await (await fetch(base, { headers: { cookie } })).text();
    const dom = new JSDOM(html);
    const state = JSON.parse(dom.window.document.querySelector('#jini-consent-config')!.textContent!);
    assert.deepEqual(state.choices, { necessary: true, functional: false, analytics: false, marketing: false });
    dom.window.close();
  }
});

test('the publishing privacy check still rejects missing local Pages', async () => {
  const privacyPageExists = createPrivacyPageCheck({ deps: { workspaceId: 'site-a', postRepo: { findBySlug: async () => null } } as never });
  assert.equal(await privacyPageExists({ url: 'https://example.com/privacy' }), true);
  assert.equal(await privacyPageExists({ url: '/Not A Slug' }), false);
  assert.equal(await privacyPageExists({ url: '/no-such-privacy-page/' }), false);
});

test('live defaults show consent; exports omit defaults, honor owner ON/OFF and block published ON', async t => {
  const settingsRepo = new InMemorySettingsRepo(); let id = 0;
  const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };
  const ids = { newId: () => `setting-${++id}` };
  const principals = { findActiveById: async ({ id }: { id: string }) => ({ id }) };
  const authorize = async () => ({ allowed: true as const, reason: 'test owner' });
  await ensureSiteConsentDefinitions({ settingsRepo, clock, ids, principals }, { systemPrincipalId: 'system' });
  const write = async (key: string, value: string | boolean) => set({ deps: { repo: settingsRepo, clock, ids, principals, authorize },
    input: { namespace: SITE_CONSENT_NAMESPACE, key, value, scope: 'workspace', workspaceId: 'site-a', callerPrincipalId: 'owner' } });
  let release!: () => void;
  const siteConsentReady = new Promise<void>(resolve => { release = resolve; });
  let published: { id: string; config: unknown } | null = null;
  const deps = { workspaceId: 'site-a', settingsRepo, clock, siteConsentReady,
    siteBinding: { dir: '/unused-consent-test' }, consentStore: { read: async () => published ? { published } : null } } as never;
  const ports = createSiteConsentPorts({ deps });
  let settled = false;
  const config = ports.config.get({}).then(value => { settled = true; return value; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  await write('privacyPolicyUrl', '/privacy'); release();
  assert.equal((await config).enabled, true);
  const app = express(); applySiteConsent({ app, deps });
  const original = '<html><head></head><body><script>window.optional=1</script></body></html>';
  app.get('/', (_req, res) => res.type('html').send(original));
  const base = await startTestServer(app, t);
  const dom = new JSDOM(await (await fetch(base)).text());
  try {
    assert.ok(dom.window.document.querySelector('#jini-consent'));
    assert.ok(dom.window.document.querySelector('#jini-consent a[href="/privacy"]'));
    assert.ok(dom.window.document.querySelector('template[data-jini-consent-script]'));
  } finally { dom.window.close(); }
  const exported = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(exported.status, 200);
  assert.equal(await exported.text(), original);
  assert.match(await (await fetch(base)).text(), /id="jini-consent"/);
  await write('enabled', true);
  const blocked = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(blocked.status, 409);
  assert.equal(await blocked.text(), 'Static export requires cookie consent to be disabled. Review optional scripts before exporting.');
  await write('enabled', false);
  assert.equal(await (await fetch(base)).text(), original);
  const disabledExport = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(disabledExport.status, 200);
  assert.equal(await disabledExport.text(), original);
  published = { id: 'published-enabled', config: { ...await config, enabled: true } };
  const publishedExport = await fetch(base, { headers: { 'x-tovu-static-export': '1' } });
  assert.equal(publishedExport.status, 409);
  assert.equal(await publishedExport.text(), 'Static export requires cookie consent to be disabled. Review optional scripts before exporting.');
});

test('consent readiness rejection propagates before any policy read', async () => {
  const failure = new Error('privacy creation failed');
  const siteConsentReady = Promise.reject(failure);
  const deps = { siteConsentReady, siteBinding: { dir: '/unused-consent-test' }, clock: { nowMs: () => 0 },
    consentStore: { read: async () => assert.fail('must wait for defaults') } } as never;
  await assert.rejects(createSiteConsentPorts({ deps }).config.get({}), error => error === failure);
});

test('a published policy with an empty Custom CSS is served with the default style; the owner\'s own CSS wins', async t => {
  const f = await publicFixture({ t });
  const state = await f.store.read({});
  assert.ok(state?.published);
  const published = state.published;
  const serve = async (customCss: string) => {
    f.deps.consentStore = { ...f.store, read: async () => ({ ...state, published: { ...published, config: { ...(published.config as object), customCss } } }) };
    return (await createSiteConsentPorts({ deps: f.deps }).config.get({})).customCss;
  };
  assert.equal(await serve(''), SITE_CONSENT_DEFAULT_CSS);
  assert.equal(await serve('#jini-consent { padding: 12px; }'), '#jini-consent { padding: 12px; }');
});

test('an auto-region published policy is refused without a trusted region header and served with one', async t => {
  const f = await publicFixture({ t });
  const state = await f.store.read({});
  assert.ok(state?.published);
  const published = state.published;
  f.deps.consentStore = { ...f.store, read: async () => ({ ...state, published: { ...published, config: { ...(published.config as object), regionMode: 'auto' } } }) };
  await assert.rejects(() => createSiteConsentPorts({ deps: f.deps }).config.get({}), { message: 'Published consent policy is invalid.' });
  const trusted = await createSiteConsentPorts({ deps: f.deps }, { trustedRegionHeader: 'x-region' }).config.get({});
  assert.equal(trusted.regionMode, 'auto');
  assert.equal(trusted.policyVersion, `${f.config.policyVersion}:${published.id}`);
});

test('an accepted choice is durably written under the site receipts directory, created on first save', async t => {
  const f = await publicFixture({ t });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tovu-consent-receipts-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  f.deps.siteBinding = { ...f.deps.siteBinding, dir };
  const app = express(); applySiteConsent({ app, deps: f.deps }, { trustedRegionHeader: 'x-region' });
  const base = await startTestServer(app, t);
  const res = await fetch(`${base}/api/site-consent`, { method: 'POST', redirect: 'manual', headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ action: 'accept', policyVersion: `${f.config.policyVersion}:${f.revisionId}` }) });
  assert.ok(res.status < 400, `status ${res.status}`);
  assert.match(res.headers.get('set-cookie') ?? '', /jini_consent=/);
  const receipts = await fs.readdir(path.join(dir, CONSENT_RECEIPTS_DIR_NAME), { recursive: true });
  assert.ok(receipts.length > 0);
});
