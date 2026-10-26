/** @file Cookie-consent public wiring. Real HTTP/policy/file adapters; client, clock, regions and
 * plugin effects are injected. No bundle build, vendor SDK, network relay or module mocks. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { JSDOM } from 'jsdom';
import type { RegionResolver } from '@jini-ai/cookie-consent';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import type { SiteConsentSource } from '#src/features/consent/cookie-consent';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { applySiteCookieConsent, type ConsentPluginHttp } from '../site-cookie-consent.js';
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
    adapter: { id: 'fixture', kind: 'consent-adapter', category: 'analytics', src: `${base}/fixture/adapter.mjs` },
    http: { path: `${base}/fixture`, handle: async input => { calls.push(input); return { status: 200, body: 'plugin response', contentType: 'text/plain', cacheControl: 'public, max-age=60' }; } },
  }];
  const app = express();
  applySiteCookieConsent({ app, deps, consent: { regionResolvers: async () => resolvers } }, { client: CLIENT });
  app.get(['/', '/about', '/index.html'], (_req, res) => res.type('html').send(PAGE));
  app.get('/stream', (_req, res) => { res.type('html'); res.write(PAGE.slice(0, 65)); res.write(PAGE.slice(65, 105)); res.end(PAGE.slice(105)); });
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
  test(`banner disabled by ${Object.keys(config)[0]} leaves public HTML untouched`, async t => {
    const f = await publicFixture({ t }, { config });
    assert.equal(await (await fetch(f.base)).text(), PAGE);
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
