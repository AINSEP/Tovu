/** Public policy/settings/security compatibility retained after retiring the HTML-rewriting engine.
 * Receipt, plugin, region and construction consumers are covered by site-cookie-consent.test.ts. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express, { type Request } from 'express';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { CONSENT_COOKIE } from '@jini-ai/cookie-consent';
import { headerResolver } from '@jini-ai/cookie-consent/server';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import { SITE_CONSENT_DEFAULT_CSS } from '#src/features/consent/config';
import { ensureSiteConsentDefinitions, SITE_CONSENT_NAMESPACE } from '#src/features/consent/settings';
import { bindSiteConsentService } from '#src/server/runtime/composition/site-consent';
import { createNoopObservabilityPort } from '#src/platform/observability/index';
import type { RouteDeps } from '#src/server/routes/types';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { CONSENT_RECEIPTS_DIR_NAME, createPrivacyPageCheck, readSiteConsentPolicy, resolveSiteConsentOrigin } from '../site-consent.js';
import { applySiteCookieConsent, readSiteVisitorConsent } from '../site-cookie-consent.js';

async function policyFixture({ t }: { t: test.TestContext }) {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tovu-consent-policy-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const deps = {
    workspaceId: 'ws', consentStore: f.store, siteConsentReady: Promise.resolve(), siteBinding: { dir: directory },
    clock: { nowMs: () => Date.parse('2026-10-26T12:00:00.000Z'), nowIso: () => '2026-10-26T12:00:00.000Z' },
    postRepo: { findBySlug: async () => null },
    authorize: f.ports.authorize, idGen: f.ports.ids, themes: [], resolveActiveThemeId: async () => 'none',
    observability: createNoopObservabilityPort({}), cookieConsent: { regionResolvers: async () => [] },
  } as unknown as RouteDeps;
  return { ...f, deps, directory, revisionId: saved.revision.id, policy: `${f.config.policyVersion}:${saved.revision.id}` };
}

const CLIENT = { src: '/_consent/client-policy.min.js', body: Buffer.from('/* policy test client */') };

async function mounted({ t, deps }: { t: test.TestContext; deps: RouteDeps }) {
  const app = express();
  applySiteCookieConsent({ app, deps, consent: deps.cookieConsent! }, { client: CLIENT });
  await deps.cookieConsent!.refresh?.();
  return { app, base: await startTestServer(app, t) };
}

test('public policy retains its published revision identity and never reads a newer draft', async t => {
  const f = await policyFixture({ t });
  await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled: false }, expectedDraftId: f.revisionId });
  const original = f.deps.consentStore!;
  f.deps.consentStore = { ...original, read: async () => assert.fail('public policy cannot read author drafts') };
  const config = await readSiteConsentPolicy({ deps: f.deps });
  assert.equal(config.enabled, true);
  assert.equal(config.policyVersion, f.policy);
});

test('the publishing privacy check still rejects missing local Pages', async () => {
  const privacyPageExists = createPrivacyPageCheck({ deps: { workspaceId: 'site-a', postRepo: { findBySlug: async () => null } } as never });
  assert.equal(await privacyPageExists({ url: 'https://example.com/privacy' }), true);
  assert.equal(await privacyPageExists({ url: '/Not A Slug' }), false);
  assert.equal(await privacyPageExists({ url: '/no-such-privacy-page/' }), false);
});

test('public defaults remain off; explicit owner settings and a published revision retain their precedence', async () => {
  const settingsRepo = new InMemorySettingsRepo(); let id = 0;
  const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };
  const ids = { newId: () => { id++; return `setting-${id}`; } };
  const principals = { findActiveById: async ({ id }: { id: string }) => ({ id }) };
  const authorize = async () => ({ allowed: true as const, reason: 'test owner' });
  await ensureSiteConsentDefinitions({ settingsRepo, clock, ids, principals }, { systemPrincipalId: 'system' });
  const write = async (key: string, value: string | boolean) => set({ deps: { repo: settingsRepo, clock, ids, principals, authorize },
    input: { namespace: SITE_CONSENT_NAMESPACE, key, value, scope: 'workspace', workspaceId: 'site-a', callerPrincipalId: 'owner' } });
  let release!: () => void;
  const siteConsentReady = new Promise<void>(resolve => { release = resolve; });
  let published: { id: string; config: unknown } | null = null;
  const deps = { workspaceId: 'site-a', settingsRepo, clock, siteConsentReady,
    consentStore: { read: async () => assert.fail('public policy must not read drafts'), readPublished: async () => published } } as never;
  let settled = false;
  const initial = readSiteConsentPolicy({ deps }).then(value => { settled = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'public reads wait for registration');
  await write('privacyPolicyUrl', '/privacy'); release();
  assert.equal((await initial).enabled, false);
  await write('enabled', true);
  assert.equal((await readSiteConsentPolicy({ deps })).enabled, true);
  await write('enabled', false);
  assert.equal((await readSiteConsentPolicy({ deps })).enabled, false);
  published = { id: 'published-enabled', config: { ...await initial, enabled: true, privacyPolicyUrl: '/privacy' } };
  const active = await readSiteConsentPolicy({ deps });
  assert.equal(active.enabled, true);
  assert.equal(active.policyVersion, `${(published.config as { policyVersion: string }).policyVersion}:published-enabled`);
});

test('consent readiness rejection propagates before any public policy read', async () => {
  const failure = new Error('privacy creation failed');
  const deps = { siteConsentReady: Promise.reject(failure),
    consentStore: { readPublished: async () => assert.fail('must wait for defaults') } } as never;
  await assert.rejects(readSiteConsentPolicy({ deps }), error => error === failure);
});

test('published empty Custom CSS uses the default style; the owner styling is preserved', async t => {
  const f = await policyFixture({ t });
  const published = (await f.store.readPublished({}))!;
  const serve = async (customCss: string) => {
    f.deps.consentStore = { ...f.store, readPublished: async () => ({ ...published, config: { ...published.config, customCss } }) };
    return (await readSiteConsentPolicy({ deps: f.deps })).customCss;
  };
  assert.equal(await serve(''), SITE_CONSENT_DEFAULT_CSS);
  assert.equal(await serve('#jini-consent { padding: 12px; }'), '#jini-consent { padding: 12px; }');
});

test('bound readiness counts site receipts and reports unavailable storage without exposing paths', async t => {
  const f = await policyFixture({ t });
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
  const receipts = path.join(f.directory, CONSENT_RECEIPTS_DIR_NAME);
  await fs.writeFile(path.join(receipts, 'receipt_01234567890123456789.json'), '{}');
  assert.deepEqual((await service.readiness({ principalId: 'owner', config })).receipts, { writable: true, count: 1 });
  await fs.rm(receipts, { recursive: true });
  await fs.writeFile(receipts, 'a file cannot store receipt files');
  const failed = await service.readiness({ principalId: 'owner', config });
  assert.equal(failed.ready, false);
  assert.deepEqual(failed.receipts, { writable: false, count: null });
  assert.ok(failed.blockingProblems.some(problem => problem.code === 'RECEIPT_STORAGE_UNAVAILABLE'));
  assert.ok(!JSON.stringify(failed).includes(f.directory));
});

test('a receipt write failure issues no cookie; foreign Origin is refused before storage work', async t => {
  const f = await policyFixture({ t });
  const blocker = path.join(f.directory, 'blocked-site');
  await fs.writeFile(blocker, 'not a directory');
  f.deps.siteBinding = { ...f.deps.siteBinding, dir: blocker };
  const { base } = await mounted({ t, deps: f.deps });
  const send = (origin: string) => fetch(base + '/_consent', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'accept', policy: f.policy }) });
  const foreign = await send('https://attacker.example');
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('set-cookie'), null);
  assert.equal(await fs.readFile(blocker, 'utf8'), 'not a directory');
  const failed = await send(base);
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('set-cookie'), null);
  assert.equal(await fs.readFile(blocker, 'utf8'), 'not a directory');
  assert.deepEqual(await failed.json(), { error: 'Your choice could not be saved. Try again.' });
});

test('an explicit US grant without a valid durable receipt remains denied', async t => {
  const f = await policyFixture({ t });
  for (const receipt of [undefined, 'short']) {
    const raw = { v: 1, p: f.policy, t: f.deps.clock.nowMs(), a: 'accept', c: { functional: true, analytics: true, marketing: true }, r: receipt };
    const cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(raw))}; jini_region=us`;
    const state = await readSiteVisitorConsent({ deps: f.deps, req: { get: (name: string) => name === 'cookie' ? cookie : undefined } as unknown as Request });
    assert.deepEqual(state.allowed, { necessary: true, functional: false, analytics: false, marketing: false });
  }
});

test('public context storage failures return 503 without disclosing stored details', async t => {
  const f = await policyFixture({ t });
  const { base } = await mounted({ t, deps: f.deps });
  f.deps.consentStore = { ...f.store, readPublished: async () => { throw new Error('private stored revision path'); } };
  const response = await fetch(base + '/_consent/context');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.ok(!(await response.text()).includes('private stored revision path'));
});

test('raw public metadata, conditional validators and stored page bytes are never rewritten', async t => {
  const f = await policyFixture({ t });
  const { app, base } = await mounted({ t, deps: f.deps });
  const page = '<html><head><link rel="canonical" href="https://site.example/"><meta name="description" data-consent-category="marketing" content="Site description"><script type="application/ld+json">{"@type":"WebSite"}</script></head><body><script data-consent-category="analytics">window.tracking=1</script></body></html>';
  const modified = 'Wed, 21 Oct 2026 12:00:00 GMT';
  app.get(['/', '/admin/example', '/api/example'], (_req, res) => res.type('html').set({ 'Cache-Control': 'public, max-age=60', 'Last-Modified': modified }).send(page));
  for (const route of ['/', '/admin/example', '/api/example']) {
    const response = await fetch(base + route);
    assert.equal(await response.text(), page);
    assert.equal(response.headers.get('set-cookie'), null);
    const etag = response.headers.get('etag');
    assert.ok(etag);
    const validators: Record<string, string>[] = [{ 'if-none-match': etag }, { 'if-modified-since': modified }];
    for (const headers of validators) {
      const conditional = await fetch(base + route, { headers, cache: 'no-cache' });
      assert.equal(conditional.status, 304);
      assert.equal(conditional.headers.get('etag'), etag);
      assert.equal(conditional.headers.get('last-modified'), modified);
    }
  }
});

for (const scenario of [
  { configured: 'http://localhost:3000', host: 'localhost:4000', expected: 'http://localhost:4000' },
  { configured: 'http://127.0.0.1:3000', host: '[::1]:4000', expected: 'http://[::1]:4000' },
  { configured: 'http://localhost:3000', host: 'attacker.example', expected: 'http://localhost:3000' },
  { configured: 'https://site.example', host: 'attacker.example', expected: 'https://site.example' },
]) test(`consent Origin remains pinned for ${scenario.configured} and Host ${scenario.host}`, t => {
  const previous = process.env.TOVU_PUBLIC_URL;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_PUBLIC_URL; else process.env.TOVU_PUBLIC_URL = previous; });
  process.env.TOVU_PUBLIC_URL = scenario.configured;
  const request = { headers: { 'x-forwarded-host': 'attacker.example' }, protocol: 'http', get: (name: string) => name === 'host' ? scenario.host : undefined } as unknown as Request;
  assert.equal(resolveSiteConsentOrigin({ request }), scenario.expected);
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
]) test(`context preserves automatic region permissions for ${scenario.name}`, async t => {
  const f = await policyFixture({ t });
  f.deps.cookieConsent!.regionResolvers = async () => scenario.configured ? [headerResolver({ id: 'configured-header', header: 'x-region' })] : [];
  const { base } = await mounted({ t, deps: f.deps });
  const response = await fetch(base + '/_consent/context', { headers: scenario.region === undefined ? {} : { 'x-region': scenario.region } });
  assert.equal(response.status, 200);
  const config = await response.json() as { enabled: boolean; regionMode: string; policy: string };
  assert.equal(config.enabled, true);
  assert.equal(config.regionMode, 'auto');
  assert.equal(config.policy, f.policy);
  const cookie = response.headers.get('set-cookie');
  if (scenario.optOut) assert.match(cookie ?? '', /jini_region=us/);
  else assert.equal(cookie, null);
  const state = await readSiteVisitorConsent({ deps: f.deps, req: { get: (name: string) => name === 'cookie' ? cookie : undefined } as unknown as Request });
  assert.equal(state.region, scenario.optOut ? 'opt-out' : 'opt-in');
  assert.equal(state.allowed.analytics, scenario.optOut);
});
