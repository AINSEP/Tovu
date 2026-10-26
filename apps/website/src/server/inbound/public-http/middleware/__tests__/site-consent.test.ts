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
import { applyBrowserAnalyticsHttp } from '#src/server/runtime/composition/browser-analytics-http';
import { bindSiteConsentService } from '#src/server/runtime/composition/site-consent';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { ensureSiteConsentDefinitions, SITE_CONSENT_NAMESPACE } from '#src/features/consent/settings';
import { SITE_CONSENT_DEFAULT_CSS } from '#src/features/consent/config';
import type { DiscoveredTheme } from '#src/features/theme/index';
import { consentDryRun } from '#src/features/consent/readiness';

async function publicFixture({ t }: { t: import('node:test').TestContext }, _options = {}) {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const deps = createRouteDeps(); deps.consentStore = f.store;
  return { ...f, deps, revisionId: saved.revision.id };
}

test('live canonical metadata reaches crawlers on all public pages without a consent grant', async t => {
  const f = await publicFixture({ t });
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get(['/', '/about', '/docs'], (req, res) => res.type('html').send(`<html><head>` +
    `<link rel="canonical" href="https://site.example${req.path}">` +
    '<meta name="description" data-consent-category="marketing" content="Site description">' +
    '<script type="application/ld+json" data-consent-category="marketing">{"@type":"WebSite"}</script>' +
    '</head><body><script data-consent-category="analytics">window.tracking=1</script></body></html>'));
  const base = await startTestServer(app, t);
  for (const page of ['/', '/about', '/docs']) {
    const response = await fetch(base + page);
    assert.equal(response.status, 200);
    const dom = new JSDOM(await response.text());
    try {
      const document = dom.window.document;
      assert.equal(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'), `https://site.example${page}`);
      assert.equal(document.head.querySelector('meta[name="description"]')?.getAttribute('content'), 'Site description');
      assert.equal(document.head.querySelector('script[type="application/ld+json"]')?.textContent, '{"@type":"WebSite"}');
      assert.equal(document.querySelector('script[data-consent-category="analytics"]'), null);
      assert.equal(document.querySelectorAll('template[data-jini-consent-script]').length, 1);
    } finally { dom.window.close(); }
  }
});

test('live and audit gates retain active and preview theme scripts across overlapping requests', async t => {
  const f = await publicFixture({ t });
  f.deps.themes = ['first', 'second'].map(id => ({
    manifest: { id, apiVersion: 2 }, status: 'valid',
    pages: { index: '<script src="../scripts/nav.js"></script>' },
    partials: {}, liquidTemplates: {}, handlebarsTemplates: {},
  } as DiscoveredTheme));
  const activate = (activeThemeId: string) => f.deps.presentationRepo.save({
    workspaceId: f.deps.workspaceId, activeThemeId, updatedAt: '2026-10-23T00:00:00Z',
  });
  await activate('first');
  let started!: () => void, release!: () => void;
  const pending = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const html = '<html><head></head><body><script src="/theme-assets/first/scripts/nav.js"></script>' +
    '<script src="/theme-assets/second/scripts/nav.js"></script><script src="https://tracker.example/track.js"></script></body></html>';
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get('/:page', async (req, res) => {
    if (req.params.page === 'held') { started(); await held; }
    res.type('html').send(html);
  });
  const base = await startTestServer(app, t);
  const firstResponse = fetch(`${base}/held`);
  await pending;
  await activate('second');
  const secondHtml = await (await fetch(`${base}/next`)).text();
  release();
  const firstHtml = await (await firstResponse).text();
  const dryRun = consentDryRun({ html, config: f.config });
  assert.ok(dryRun.gatedHtml);
  for (const [body, active, other] of [[firstHtml, 'first', 'second'], [secondHtml, 'second', 'first'],
    [dryRun.gatedHtml, 'second', 'first']]) {
    const dom = new JSDOM(body);
    try {
      const document = dom.window.document;
      assert.ok(document.querySelector(`script[src="/theme-assets/${active}/scripts/nav.js"]`));
      assert.ok(document.querySelector(`script[src="/theme-assets/${other}/scripts/nav.js"]`));
      assert.equal(document.querySelector('script[src="https://tracker.example/track.js"]'), null);
      assert.equal(document.querySelectorAll('template[data-jini-consent-script]').length, 1);
    } finally { dom.window.close(); }
  }
});

test('page requests need no active-theme source scan to run first-party assets', async t => {
  const f = await publicFixture({ t });
  f.deps.themes = [{ manifest: { id: 'active', apiVersion: 2 }, status: 'valid',
    get pages() { assert.fail('consent must not scan loaded theme templates'); } } as unknown as DiscoveredTheme];
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get(['/', '/_themes/preview'], (_req, res) => res.type('html').send('<html><head></head><body>' +
    '<script src="/theme-assets/preview/scripts/nav.js"></script></body></html>'));
  const base = await startTestServer(app, t);
  for (const path of ['/', '/?theme=preview', '/_themes/preview']) {
    const dom = new JSDOM(await (await fetch(base + path)).text());
    try { assert.ok(dom.window.document.querySelector('script[src="/theme-assets/preview/scripts/nav.js"]')); }
    finally { dom.window.close(); }
  }
});

test('live HTML is gated and static export returns 409 without changing the live delivery mode', async t => {
  const f = await publicFixture({ t }); const app = express();
  applySiteConsent({ app, deps: f.deps });
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body><script data-consent-category="analytics">window.optional=1</script></body></html>'));
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
  const original = '<html><head></head><body><script data-consent-category="analytics">window.optional=1</script></body></html>';
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
              assert.equal(document.querySelector('template[data-jini-consent-script]')?.innerHTML, '<script data-consent-category="analytics">window.optional=1</script>');
              assert.ok(![...document.querySelectorAll('script')].some(script => script.textContent === 'window.optional=1'));
            } finally { dom.window.close(); }
          }
        }
        if (method === 'HEAD' || policy === 'off') assert.equal(html, '');
      }
    }
  }
});

test('admin and API requests retain both conditional headers while public pages remain protected', async t => {
  const f = await publicFixture({ t });
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get(['/admin/settings', '/api/admin/v1/workspaces/workspace-local/skills', '/public-page'], (req, res) => {
    res.json({ etag: req.get('if-none-match') ?? null, modified: req.get('if-modified-since') ?? null });
  });
  const base = await startTestServer(app, t);
  const headers = { 'If-None-Match': 'W/"skills"', 'If-Modified-Since': 'Wed, 21 Oct 2026 12:00:00 GMT' };
  for (const route of ['/admin/settings', '/api/admin/v1/workspaces/workspace-local/skills']) {
    const response = await fetch(base + route, { headers, cache: 'no-cache' });
    assert.deepEqual(await response.json(), { etag: headers['If-None-Match'], modified: headers['If-Modified-Since'] });
  }
  const page = await fetch(`${base}/public-page`, { headers, cache: 'no-cache' });
  assert.deepEqual(await page.json(), { etag: null, modified: null });
});

test('bootstrap or policy-store failure never returns ungated active HTML', async t => {
  const f = await publicFixture({ t });
  const failing = { ...f.store, read: async () => { throw new Error('sensitive persisted location'); } };
  f.deps.consentStore = failing;
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get('/', (_req, res) => res.type('html').send('<html><body><script data-consent-category="analytics">window.leaked=1</script></body></html>'));
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
  const original = '<html><head></head><body><script data-consent-category="analytics">window.optional=1</script></body></html>';
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
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body><script data-consent-category="analytics">window.optional=1</script></body></html>'));
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
  const original = '<html><head></head><body><script data-consent-category="analytics">window.optional=1</script></body></html>';
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

for (const scenario of [
  { name: 'configured US', configured: true, region: 'US', optOut: true },
  { name: 'configured lowercase US subdivision', configured: true, region: 'us-ca', optOut: true },
  { name: 'missing configured header', configured: true, region: undefined, optOut: false },
  { name: 'unknown configured country', configured: true, region: 'XX', optOut: false },
  { name: 'non-US configured country', configured: true, region: 'DE', optOut: false },
  { name: 'malformed configured country', configured: true, region: 'US,DE', optOut: false },
  { name: 'visitor US header without configuration', configured: false, region: 'US', optOut: false },
  { name: 'no region configuration or header', configured: false, region: undefined, optOut: false },
]) test(`automatic region shows exact first-layer choices for ${scenario.name}`, async t => {
  const f = await publicFixture({ t });
  const state = await f.store.read({});
  assert.ok(state?.published);
  const published = state.published;
  f.deps.consentStore = { ...f.store, read: async () => ({ ...state, published: { ...published, config: { ...(published.config as object), regionMode: 'auto' } } }) };
  assert.equal((await createSiteConsentPorts({ deps: f.deps }).config.get({})).regionMode, 'auto');
  const trusted = await createSiteConsentPorts({ deps: f.deps }, { trustedRegionHeader: 'x-region' }).config.get({});
  assert.equal(trusted.regionMode, 'auto');
  assert.equal(trusted.policyVersion, `${f.config.policyVersion}:${published.id}`);
  const app = express();
  applySiteConsent({ app, deps: f.deps }, scenario.configured ? { trustedRegionHeader: 'x-region' } : {});
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body>Site</body></html>'));
  const base = await startTestServer(app, t);
  const response = await fetch(base, { headers: scenario.region === undefined ? {} : { 'x-region': scenario.region } });
  assert.equal(response.status, 200);
  const dom = new JSDOM(await response.text());
  try {
    const buttons = [...dom.window.document.querySelectorAll('.jini-consent-actions.jini-consent-initial button')];
    assert.deepEqual(buttons.map(button => button.getAttribute('value')), scenario.optOut ? ['accept'] : ['reject', 'accept']);
    assert.deepEqual(buttons.map(button => button.textContent), scenario.optOut ? [f.config.acceptLabel] : [f.config.rejectLabel, f.config.acceptLabel]);
  } finally { dom.window.close(); }
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

for (const footer of ['', '<footer>Theme footer</footer>']) test(`host link reaches streamed and ordinary pages with footer=${Boolean(footer)}`, async t => {
  const f = await publicFixture({ t });
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get(['/', '/about', '/stream', '/headerless'], (req, res) => {
    if (req.path !== '/headerless') res.type('html');
    const html = `<html><head></head><body><main>${req.path}</main>${footer}</body></html>`;
    if (req.path === '/stream' || req.path === '/headerless') { res.write(html.slice(0, 25)); res.end(html.slice(25)); }
    else res.send(html);
  });
  const base = await startTestServer(app, t);
  for (const page of ['/', '/about', '/stream', '/headerless']) {
    const response = await fetch(base + page);
    assert.equal(response.status, 200);
    const dom = new JSDOM(await response.text());
    try {
      const link = dom.window.document.querySelector('a[data-jini-consent-open]');
      assert.equal(link?.textContent, 'Cookie settings');
      assert.equal(link?.closest('footer') !== null, Boolean(footer));
      assert.equal(dom.window.document.querySelector('#jini-consent')?.getAttribute('data-reopen'), 'link');
    } finally { dom.window.close(); }
  }
});

test('cached published unsafe-eval and the host link survive a later configuration read failure', async t => {
  const f = consentFixture({ t });
  const draft = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, allowUnsafeEval: true }, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: draft.revision.id, expectedPublishedId: null });
  const deps = createRouteDeps(); deps.consentStore = f.store;
  const app = express(); applySiteConsent({ app, deps });
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body>Page</body></html>'));
  const base = await startTestServer(app, t);
  for (const failRead of [false, true]) {
    if (failRead) deps.consentStore = { ...f.store, read: async () => { throw new Error('temporary storage failure'); } };
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const dom = new JSDOM(await response.text());
    try {
      assert.ok(dom.window.document.querySelector('a[data-jini-consent-open]'));
      assert.match(dom.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '', /'unsafe-eval'/);
    } finally { dom.window.close(); }
  }
});

test('plugin collectors and CDNs never widen the pre-choice or rejected consent CSP', async t => {
  const f = await publicFixture({ t });
  f.deps.browserAnalytics = () => [{ supportsStatic: false, origins: ['https://cdn.jsdelivr.net', 'https://us.i.posthog.com', 'https://us-assets.i.posthog.com'], source: 'function(){return function(){}}' }];
  const app = express(); applySiteConsent({ app, deps: f.deps });
  app.get('/', (_req, res) => res.type('html').send('<html><head></head><body>Page</body></html>'));
  const base = await startTestServer(app, t);
  const initial = await (await fetch(base)).text();
  const choice = await fetch(base + '/api/site-consent', { method: 'POST', headers: { origin: base, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'reject', policyVersion: `${f.config.policyVersion}:${f.revisionId}` }) });
  assert.equal(choice.status, 200);
  const cookie = choice.headers.get('set-cookie')!.split(';')[0]!;
  const rejected = await (await fetch(base, { headers: { cookie } })).text();
  for (const html of [initial, rejected]) {
    const dom = new JSDOM(html);
    try {
      const policies = Array.from(dom.window.document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).map(node => node.getAttribute('content'));
      assert.ok(policies.length > 0);
      for (const policy of policies) {
        assert.ok(policy!.includes("connect-src 'self'"));
        assert.equal(/jsdelivr|posthog/.test(policy!), false);
      }
    } finally { dom.window.close(); }
  }
});

test('same-origin analytics collection is denied before a choice and for unauthenticated admin callers', async t => {
  const f = await publicFixture({ t });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tovu-consent-relay-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  f.deps.siteBinding = { ...f.deps.siteBinding, dir };
  const calls: unknown[] = [];
  f.deps.browserAnalytics = ({ surface }) => [{ source: 'function(){return function(){}}', origins: [], supportsStatic: false,
    http: { path: '/_jini/browser-analytics/fixture/' + surface, handle: async input => { calls.push(input); return { status: 200, body: '1' }; } } }];
  const app = express(); applySiteConsent({ app, deps: f.deps }); applyBrowserAnalyticsHttp({ app, deps: f.deps });
  const base = await startTestServer(app, t);
  const send = (surface = 'site', cookie = '', origin = base) => fetch(base + '/_jini/browser-analytics/fixture/' + surface + '/e/', {
    method: 'POST', headers: { origin, cookie, 'content-type': 'text/plain' }, body: 'fixture-event',
  });
  assert.equal((await send()).status, 403); assert.deepEqual(calls, []);
  const choice = await fetch(base + '/api/site-consent', { method: 'POST', headers: { origin: base, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'reject', policyVersion: `${f.config.policyVersion}:${f.revisionId}` }) });
  assert.equal(choice.status, 200);
  const cookie = choice.headers.get('set-cookie')!.split(';')[0]!;
  assert.equal((await send('site', cookie, 'https://other.example')).status, 403);
  assert.equal((await send('admin', cookie)).status, 403); assert.deepEqual(calls, []);
  assert.equal((await send('site', cookie)).status, 200);
  assert.equal(calls.length, 1);
  const input = calls[0] as { body: Uint8Array; path: string };
  assert.equal(input.path, '/e/'); assert.equal(Buffer.from(input.body).toString(), 'fixture-event');
  assert.equal(JSON.stringify(calls).includes('jini_consent'), false);
});
