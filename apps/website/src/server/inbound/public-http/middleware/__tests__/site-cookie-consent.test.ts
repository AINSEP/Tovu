/** @file Cookie-consent public wiring. Real HTTP/policy/file adapters; client, clock, regions and
 * plugin effects are injected. No bundle build, vendor SDK, network relay or module mocks. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import * as fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { JSDOM } from 'jsdom';
import type { RegionResolver } from '@jini-ai/cookie-consent';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import type { SiteConsentSource } from '#src/features/consent/cookie-consent';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { bindCookieConsentAnalyticsGate } from '#src/server/runtime/composition/site-cookie-consent';
import { applySiteCookieConsent, cookieConsentPreviewGate, type ConsentPluginHttp } from '../site-cookie-consent.js';
import { CONSENT_RECEIPTS_DIR_NAME, CONSENT_SAVE_PROFILE } from '../site-consent.js';

const CLIENT = { src: '/_consent/client-0123456789ab.min.js', body: Buffer.from('/* injected consent client */') };
const PAGE = '<!doctype html><html><head><!-- </head> --><title>Site</title></head><body><main>Site</main><footer>Footer</footer><!-- </body> --></body></html>';
const PLUGIN_PATH = '/_consent/p/fixture';

/** Publish through the existing fixture, use one disposable site directory, and mount production
 * middleware with effect fakes. Time moves explicitly, never by sleeping. */
async function publicFixture({ t }: { t: TestContext }, { config = {}, resolvers = [] }: { config?: Partial<SiteConsentSource>; resolvers?: readonly RegionResolver[] } = {}) {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, ...config }, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tovu-cookie-consent-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const deps = createRouteDeps();
  deps.consentStore = f.store;
  deps.siteConsentReady = Promise.resolve();
  deps.siteBinding = { ...deps.siteBinding, dir: directory };
  let now = Date.parse('2026-10-26T12:00:00.000Z');
  deps.clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const calls: Parameters<ConsentPluginHttp['handle']>[0][] = [];
  deps.consentAdapters = ({ base }) => [{
    adapter: { id: 'fixture', kind: 'consent-adapter', category: 'analytics', supportsAnonymous: true, src: `${base}/fixture/adapter.mjs` },
    http: { path: `${base}/fixture`, handle: async input => { calls.push(input); return { status: 200, body: 'plugin response', contentType: 'text/plain', cacheControl: 'public, max-age=60' }; } },
  }];
  const app = express();
  applySiteCookieConsent({ app, deps, consent: { regionResolvers: async () => resolvers } }, { client: CLIENT });
  app.get(['/', '/about', '/index.html'], (_req, res) => res.type('html').send(PAGE));
  app.get('/stream', (_req, res) => { res.type('html'); res.write(PAGE.slice(0, 65)); res.write(PAGE.slice(65, 105)); res.end(PAGE.slice(105)); });
  // Plain Uint8Array chunks (not Buffers), as a piped web stream writes them.
  app.get('/bytes', (_req, res) => { res.type('html'); res.write(new Uint8Array(Buffer.from(PAGE.slice(0, 65)))); res.end(new Uint8Array(Buffer.from(PAGE.slice(65)))); });
  app.get(['/admin/example', '/api/example', '/theme-preview/example'], (_req, res) => res.type('html').send(PAGE));
  app.get('/asset.css', (_req, res) => res.type('css').send('body{}'));
  const base = await startTestServer(app, t);
  const policy = `${f.config.policyVersion}:${saved.revision.id}`;
  return { ...f, deps, base, directory, calls, policy, advance: ({ ms }: { ms: number }) => { now += ms; } };
}

/** A browser choice with a receipt by default; patches exercise pending, stale and denied choices. */
function consentCookie({ policy, now }: { policy: string; now: number }, { patch = {} }: { patch?: Record<string, unknown> } = {}): string {
  return 'jini_consent=' + encodeURIComponent(JSON.stringify({ v: 1, p: policy, t: now, a: 'accept', c: { functional: true, analytics: true, marketing: true }, r: 'receipt_fixture_0123456789', ...patch }));
}

/** A GET whose path reaches the server byte for byte (fetch would normalize dot segments away). */
function rawGet({ base, path: requestPath }: { base: string; path: string }): Promise<number> {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    http.get({ host: url.hostname, port: url.port, path: requestPath }, response => { response.resume(); response.on('end', () => resolve(response.statusCode!)); }).on('error', reject);
  });
}

/** Receipts use the public Host origin. A foreign Origin changes only the trust input. */
function postChoice({ base, policy }: { base: string; policy: string }, { origin = base }: { origin?: string } = {}) {
  return fetch(base + '/_consent', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'accept', policy }) });
}

test('client asset serves injected bytes at its immutable URL without page cookies', async t => {
  const f = await publicFixture({ t }, { resolvers: [{ id: 'us', kind: 'region-resolver', resolve: async () => 'us' }] });
  const response = await fetch(f.base + CLIENT.src);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /javascript/);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(await response.text(), CLIENT.body.toString());
  assert.equal(response.headers.get('set-cookie'), null);
});

test('ordinary and streamed public HTML get one banner, config, client and footer link', async t => {
  const f = await publicFixture({ t });
  for (const page of ['/', '/about', '/index.html', '/stream']) {
    const response = await fetch(f.base + page);
    assert.equal(response.status, 200);
    const dom = new JSDOM(await response.text());
    try {
      const document = dom.window.document;
      assert.equal(document.querySelectorAll('#jini-consent').length, 1);
      assert.equal(document.head.querySelectorAll('#jini-consent-config').length, 1);
      assert.equal(document.head.querySelectorAll(`script[src="${CLIENT.src}"]`).length, 1);
      assert.equal(document.querySelectorAll('footer a[data-consent-open]').length, 1);
      const config = JSON.parse(document.querySelector('#jini-consent-config')!.textContent!);
      assert.equal(config.policy, f.policy);
      assert.deepEqual(config.evidence, { mode: 'durable', endpoint: '/_consent' });
      assert.equal(config.plugins[0].src, PLUGIN_PATH + '/adapter.mjs');
      assert.equal(document.querySelector('main')?.textContent, 'Site');
    } finally { dom.window.close(); }
  }
  assert.deepEqual(f.calls, [], 'rendering the page must not call a plugin');
});

test('POST /_consent saves an immutable receipt in the serving site, returns 201 and sets no cookie', async t => {
  const f = await publicFixture({ t });
  const response = await postChoice(f);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { id } = await response.json() as { id: string };
  assert.match(id, /^[\w-]{16,128}$/);
  const directory = path.join(f.directory, CONSENT_RECEIPTS_DIR_NAME);
  assert.deepEqual(await fs.readdir(directory), [`${id}.json`]);
  const record = JSON.parse(await fs.readFile(path.join(directory, `${id}.json`), 'utf8'));
  assert.equal(record.policyVersion, f.policy);
  assert.equal(record.action, 'accept');
  assert.equal(record.timestamp, f.deps.clock.nowIso());
  assert.deepEqual(record.choices, { necessary: true, functional: true, analytics: true, marketing: true });
});

test('cross-origin receipt writes are 403 and never reach storage', async t => {
  const f = await publicFixture({ t });
  const response = await postChoice(f, { origin: 'https://other.example' });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('receipt limit accepts max + burst, rejects the next request, and resets with the injected clock', async t => {
  const f = await publicFixture({ t });
  const capacity = CONSENT_SAVE_PROFILE.max + CONSENT_SAVE_PROFILE.burst;
  for (let count = 0; count < capacity; count++) {
    const response = await postChoice(f);
    assert.equal(response.status, 201, `choice ${count + 1}`);
    await response.text();
  }
  const limited = await postChoice(f);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('set-cookie'), null);
  assert.equal((await fs.readdir(path.join(f.directory, CONSENT_RECEIPTS_DIR_NAME))).length, capacity);
  f.advance({ ms: CONSENT_SAVE_PROFILE.windowSeconds * 1000 });
  const resumed = await postChoice(f);
  assert.equal(resumed.status, 201);
  await resumed.text();
});

test('plugin collectors require same-origin, current category consent and a receipt; GET assets stay public', async t => {
  const f = await publicFixture({ t });
  const cookie = consentCookie({ policy: f.policy, now: f.deps.clock.nowMs() });
  const send = ({ cookie = '', origin = f.base, gpc = '0' } = {}) => fetch(f.base + PLUGIN_PATH + '/collect', {
    method: 'POST', headers: { cookie, origin, 'sec-gpc': gpc, 'content-type': 'text/plain' }, body: 'event',
  });
  const unconfirmed = consentCookie({ policy: f.policy, now: f.deps.clock.nowMs() }, { patch: { r: undefined } });
  const denied = consentCookie({ policy: f.policy, now: f.deps.clock.nowMs() }, { patch: { a: 'reject', c: { functional: true, analytics: false, marketing: true } } });
  const stale = consentCookie({ policy: 'old-policy', now: f.deps.clock.nowMs() });
  for (const input of [{}, { cookie: unconfirmed }, { cookie: denied }, { cookie: stale }, { cookie, origin: 'https://other.example' }, { cookie, gpc: '1' }]) {
    const response = await send(input);
    assert.equal(response.status, 403);
    await response.text();
  }
  assert.deepEqual(f.calls, []);
  const accepted = await send({ cookie });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('cache-control'), 'private, no-store');
  assert.equal(await accepted.text(), 'plugin response');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.path, '/collect');
  assert.equal(Buffer.from(f.calls[0]!.body).toString(), 'event');
  const asset = await fetch(f.base + PLUGIN_PATH + '/adapter.mjs');
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(await asset.text(), 'plugin response');
  assert.equal(f.calls.length, 2);
});

for (const scenario of [
  { hint: 'us' as const, cookie: '', expected: /jini_region=us/ },
  { hint: 'us' as const, cookie: 'jini_region=us', expected: null },
  { hint: 'us' as const, cookie: 'jini_region=old', expected: /jini_region=us/ },
  { hint: 'strict' as const, cookie: 'jini_region=us', expected: /jini_region=;.*Expires=/ },
  { hint: 'strict' as const, cookie: 'jini_region=old', expected: /jini_region=;.*Expires=/ },
  { hint: 'strict' as const, cookie: '', expected: null },
]) test(`region ${scenario.hint} changes cookie only as needed (incoming ${scenario.cookie || 'absent'})`, async t => {
  const f = await publicFixture({ t }, { resolvers: [{ id: 'fixture', kind: 'region-resolver', resolve: async () => scenario.hint }] });
  const response = await fetch(f.base, { headers: { cookie: scenario.cookie } });
  const setCookie = response.headers.get('set-cookie');
  if (scenario.expected) assert.match(setCookie!, scenario.expected);
  else assert.equal(setCookie, null);
  await response.text();
  const asset = await fetch(f.base + '/asset.css', { headers: { cookie: scenario.cookie } });
  assert.equal(asset.headers.get('set-cookie'), null);
  await asset.text();
});

test('static export uses local evidence, omits plugins and never resolves or sets region cookies', async t => {
  let regionReads = 0, pluginReads = 0;
  const f = await publicFixture({ t }, { resolvers: [{ id: 'fixture', kind: 'region-resolver', resolve: async () => { regionReads++; return 'us'; } }] });
  f.deps.consentAdapters = () => { pluginReads++; return []; };
  const response = await fetch(f.base, { headers: { 'x-tovu-static-export': '1', cookie: 'jini_region=us' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const dom = new JSDOM(await response.text());
  try {
    const document = dom.window.document;
    assert.equal(document.querySelector('#jini-consent')?.getAttribute('data-evidence'), 'local');
    const config = JSON.parse(document.querySelector('#jini-consent-config')!.textContent!);
    assert.deepEqual(config.evidence, { mode: 'local' });
    assert.equal(config.plugins, undefined);
    assert.ok(document.querySelector(`script[src="${CLIENT.src}"]`));
  } finally { dom.window.close(); }
  assert.deepEqual(f.calls, []);
  assert.equal(regionReads, 0);
  assert.equal(pluginReads, 0);
});

for (const config of [{ bannerMode: 'off' as const }, { enabled: false }]) {
  test(`banner disabled by ${Object.keys(config)[0]} boots anonymous analytics without UI or region cookies`, async t => {
    let regions = 0;
    const f = await publicFixture({ t }, { config, resolvers: [{ id: 'us', kind: 'region-resolver', resolve: () => { regions++; return 'us'; } }] });
    const response = await fetch(f.base);
    assert.equal(response.headers.get('set-cookie'), null);
    const dom = new JSDOM(await response.text());
    try {
      const doc = dom.window.document;
      assert.equal(JSON.parse(doc.querySelector('#jini-consent-config')!.textContent!).banner, 'off');
      assert.ok(doc.querySelector(`script[src="${CLIENT.src}"]`));
      assert.equal(doc.querySelector('#jini-consent'), null);
      assert.equal(doc.querySelector('[data-consent-open]'), null);
    } finally { dom.window.close(); }
    assert.equal(regions, 0, 'off must not resolve a visitor region');
    const send = (headers = {}) => fetch(f.base + PLUGIN_PATH + '/collect', { method: 'POST', headers: { origin: f.base, ...headers }, body: 'event' });
    const anonymous = await send();
    assert.equal(anonymous.status, 200);
    await anonymous.text();
    assert.equal(f.calls[0]!.analyticsLevel, 'anonymous');
    for (const signal of [{ 'sec-gpc': '1' }, { dnt: '1' }]) {
      const blocked = await send(signal);
      assert.equal(blocked.status, 403);
      await blocked.text();
    }
    assert.equal(f.calls.length, 1, 'privacy signals never reach the collector');
  });
}

test('admin, API and theme previews receive no banner or region cookie', async t => {
  let regionReads = 0;
  const f = await publicFixture({ t }, { resolvers: [{ id: 'fixture', kind: 'region-resolver', resolve: async () => { regionReads++; return 'us'; } }] });
  for (const route of ['/admin/example', '/api/example', '/theme-preview/example']) {
    const response = await fetch(f.base + route);
    assert.equal(await response.text(), PAGE);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(regionReads, 0);
});

test('HTML written as plain Uint8Array chunks keeps its bytes and gets one banner', async t => {
  const f = await publicFixture({ t });
  const dom = new JSDOM(await (await fetch(f.base + '/bytes')).text());
  try {
    assert.equal(dom.window.document.querySelector('main')?.textContent, 'Site');
    assert.equal(dom.window.document.querySelectorAll('#jini-consent').length, 1);
  } finally { dom.window.close(); }
});

test('the admin preview keeps the footer settings link that live pages get', t => {
  const f = consentFixture({ t });
  const html = cookieConsentPreviewGate({ html: PAGE, config: { ...f.config, bannerMode: 'jini' } as Parameters<typeof cookieConsentPreviewGate>[0]['config'],
    record: null, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' });
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    assert.equal(document.querySelectorAll('footer a[data-consent-open]').length, 1);
    assert.equal(document.documentElement.getAttribute('data-consent-region'), 'opt-in');
    assert.equal(document.querySelectorAll('#jini-consent[data-preview]').length, 1);
  } finally { dom.window.close(); }
});

test('a plugin claiming a non-optional category gets the strictest gate, not a free pass', async t => {
  const f = await publicFixture({ t });
  const calls: unknown[] = [];
  f.deps.consentAdapters = ({ base }) => [{
    adapter: { id: 'claims', kind: 'consent-adapter', category: 'necessary', src: `${base}/claims/a.mjs` },
    http: { path: `${base}/claims`, handle: async input => { calls.push(input); return { status: 200, body: 'ok' }; } },
  }];
  const response = await fetch(f.base + '/_consent/p/claims/collect', { method: 'POST', headers: { origin: f.base, 'content-type': 'text/plain' }, body: 'event' });
  assert.equal(response.status, 403);
  await response.text();
  assert.deepEqual(calls, []);
});

test('plugin paths with dot segments or encoded separators never reach a plugin handler', async t => {
  const f = await publicFixture({ t });
  for (const requestPath of [PLUGIN_PATH + '/../fixture/adapter.mjs', PLUGIN_PATH + '/%2e%2e/secret', PLUGIN_PATH + '/a%2fb', PLUGIN_PATH + '/./adapter.mjs']) {
    assert.equal(await rawGet({ base: f.base, path: requestPath }), 404, requestPath);
  }
  assert.deepEqual(f.calls, []);
});

test('detached delivery rechecks the receipt: a forged, withdrawn or stale-policy proof never delivers', async t => {
  const f = await publicFixture({ t });
  bindCookieConsentAnalyticsGate({ deps: f.deps });
  const allowed = (proof: { receiptId: string; policyVersion: string }) => f.deps.visitorAnalyticsDeliveryAllowed!({ proof });
  const accepted = await postChoice(f);
  const { id } = await accepted.json() as { id: string };
  assert.equal(await allowed({ receiptId: id, policyVersion: f.policy }), true);
  assert.equal(await allowed({ receiptId: 'forged_receipt_0123456789', policyVersion: f.policy }), false);
  assert.equal(await allowed({ receiptId: id, policyVersion: 'old-policy' }), false);
  const withdrawn = await fetch(f.base + '/_consent', { method: 'POST', headers: { origin: f.base, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'withdraw', policy: f.policy, previousId: id }) });
  assert.equal(withdrawn.status, 201);
  await withdrawn.text();
  assert.equal(await allowed({ receiptId: id, policyVersion: f.policy }), false);
});

test('US no-choice collectors allow analytics except under DNT; strict regions deny', async t => {
  const f = await publicFixture({ t });
  const send = (headers: Record<string, string>) => fetch(f.base + PLUGIN_PATH + '/collect', { method: 'POST', headers: { origin: f.base, ...headers }, body: 'event' });
  for (const headers of [{ cookie: 'jini_region=us', dnt: '1' }, { cookie: 'jini_region=de' }, { cookie: 'jini_region=gb' }, {}]) {
    const res = await send(headers);
    assert.equal(res.status, 403);
    await res.text();
  }
  assert.equal(f.calls.length, 0);
  const us = await send({ cookie: 'jini_region=us' });
  assert.equal(us.status, 200);
  await us.text();
  assert.equal(f.calls[0]!.analyticsLevel, 'full');
});

test('off refuses collectors whose adapter does not declare anonymous support', async t => {
  const f = await publicFixture({ t }, { config: { enabled: false } });
  const original = f.deps.consentAdapters!;
  f.deps.consentAdapters = input => original(input).map(item => ({ ...item, adapter: { ...item.adapter, supportsAnonymous: undefined } }));
  const res = await fetch(f.base + PLUGIN_PATH + '/collect', { method: 'POST', headers: { origin: f.base }, body: 'event' });
  assert.equal(res.status, 403);
  await res.text();
  assert.equal(f.calls.length, 0);
});
