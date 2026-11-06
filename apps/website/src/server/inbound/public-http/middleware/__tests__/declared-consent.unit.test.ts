import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { applyRenderThemeOverride } from '../render-theme-override.js';
import { applySiteCookieConsent, siteConsentDocumentAssets, readSiteVisitorConsent, readSiteAnalyticsProof, siteReceiptAllowsAnalytics } from '../site-cookie-consent.js';
import { InMemorySettingsRepo, set } from '@jini-ai/core/settings';
import { ensureSiteConsentDefinitions, SITE_CONSENT_NAMESPACE } from '#src/features/consent/settings';
import { SITE_CONSENT_DEFAULTS } from '#src/features/consent/config';
import type { RouteDeps } from '#src/server/routes/types';
import { dispatchJsonRequest, dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';

async function fixture(enabled: boolean, scriptDeclarations?: import('#src/contracts/headless/index').SiteCookieConsentDeps['scriptDeclarations']) {
  let reads = 0;
  let regionReads = 0;
  let draftReads = 0;
  const consent = { ...(scriptDeclarations && { scriptDeclarations }), regionResolvers: async () => { regionReads++; return []; } };
  const deps = {
    cookieConsent: consent, workspaceId: 'declaration-fixture', siteConsentReady: Promise.resolve(),
    siteBinding: { dir: '/tmp/consent-declare-fixture' }, clock: { nowMs: Date.now },
    consentStore: {
      read: async () => { draftReads++; throw new Error('Public traffic must never read drafts'); },
      readPublished: async () => { reads++; return { id: 'published', actorId: 'fixture', createdAt: '2026-11-05', config: { ...SITE_CONSENT_DEFAULTS, enabled, privacyPolicyUrl: '/privacy' } }; },
    },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/client-test.min.js', body: Buffer.from('/* fixture */') } });
  await deps.cookieConsent!.refresh!();
  const page = '<!doctype html><html><head></head><body><script src="/raw.js"></script><p>unchanged €</p></body></html>';
  app.get('/raw', (_req, res) => res.type('html').send(page));
  app.get('/assets', async (req, res) => res.json(await siteConsentDocumentAssets({ deps, request: req, scripts: [] })));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  reads = regionReads = 0;
  return { app, deps, page, url: `http://127.0.0.1:${address.port}`, counts: () => ({ reads, regionReads, draftReads }), close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

test('consent middleware leaves page bytes and shared-cache response untouched', async () => {
  const f = await fixture(true);
  try {
    const response = await fetch(`${f.url}/raw`);
    assert.equal(await response.text(), f.page);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(f.counts(), { reads: 0, regionReads: 0, draftReads: 0 });
  } finally { await f.close(); }
});

test('consent off emits no consent runtime and page requests perform no consent reads', async () => {
  const f = await fixture(false);
  try {
    const response = await fetch(`${f.url}/assets`);
    assert.deepEqual(await response.json(), { head: '', body: '' });
    assert.deepEqual(f.counts(), { reads: 0, regionReads: 0, draftReads: 0 });
  } finally { await f.close(); }
});

test('one no-store context request reuses publication and resolves region once', async () => {
  const f = await fixture(true);
  try {
    const response = await fetch(`${f.url}/_consent/context`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.deepEqual(await response.json(), { enabled: true, policy: '1:published', regionMode: 'auto' });
    assert.deepEqual(f.counts(), { reads: 0, regionReads: 1, draftReads: 0 });
  } finally { await f.close(); }
});

test('enabled document slots include a native withdrawal link and both browser assets', async () => {
  const f = await fixture(true);
  try {
    const response = await fetch(`${f.url}/assets`);
    const assets = await response.json() as { head: string; body: string };
    assert.match(assets.head, /client-test\.min\.js/);
    assert.match(assets.head, /extensions\.min\.js/);
    assert.equal((assets.head.match(/<style/g) ?? []).length, 1, 'settings style belongs to banner CSS');
    assert.match(assets.body, /href="#privacy-choices" data-consent-open>Cookie settings/);
    assert.deepEqual(f.counts(), { reads: 0, regionReads: 0, draftReads: 0 });
  } finally { await f.close(); }
});


test('disabled server permission/proof/delivery checks add no consent I/O or cookie reads', async () => {
  const f = await fixture(false);
  const req = { get: (name: string) => { assert.notEqual(name, 'cookie'); return undefined; } } as import('express').Request;
  try {
    assert.equal((await readSiteVisitorConsent({ deps: f.deps, req })).analyticsLevel, 'anonymous');
    assert.equal(await readSiteAnalyticsProof({ deps: f.deps, req }), undefined);
    assert.equal(await siteReceiptAllowsAnalytics({ deps: f.deps, proof: { receiptId: 'unused-receipt', policyVersion: 'unused-policy' } }), false);
    assert.deepEqual(f.counts(), { reads: 0, regionReads: 0, draftReads: 0 });
  } finally { await f.close(); }
});


test('disabled sites deliver ordinary plugin scripts from activation data without page-time manifest reads', async () => {
  let reads = 0;
  const f = await fixture(false, async () => { reads++; return { scripts: [{ src: '/plugin-menu.js', consent: ['functional'] }], problems: [] }; });
  reads = 0;
  try {
    const response = await fetch(`${f.url}/assets`);
    const assets = await response.json() as { head: string; body: string };
    assert.match(assets.head, /data-jini-declared-script src="\/plugin-menu.js"/);
    assert.doesNotMatch(assets.head, /_consent/);
    assert.deepEqual(await f.deps.cookieConsent!.exportAssets!(), ['/plugin-menu.js']);
    assert.equal(reads, 0);
    assert.deepEqual(f.counts(), { reads: 0, regionReads: 0, draftReads: 0 });
  } finally { await f.close(); }
});

test('automatic declarations use ordinary delivery before context; only optional scripts stay JSON', async () => {
  const f = await fixture(true, async () => ({ scripts: [
    { src: '/menu.js' }, { src: 'https://example.com/automatic.js' },
    { src: '/essential.js', consent: ['necessary'] }, { src: '/stats.js', consent: ['analytics'] },
  ], problems: [] }));
  try {
    const response = await fetch(`${f.url}/assets`);
    const assets = await response.json() as { head: string; body: string };
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<html><head>${assets.head}</head><body>${assets.body}</body></html>`);
    try {
      assert.ok(dom.window.document.querySelector('script[data-jini-declared-script][src="/menu.js"]'));
      assert.ok(dom.window.document.querySelector('script[src="https://example.com/automatic.js"]'));
      assert.ok(dom.window.document.querySelector('script[src="/essential.js"]'));
      assert.equal(dom.window.document.querySelector('script[src="/stats.js"]'), null);
      const config = JSON.parse(dom.window.document.getElementById('jini-consent-config')!.textContent!);
      assert.deepEqual(config.scripts, [{ src: '/stats.js', consent: ['analytics'] }]);
    } finally { dom.window.close(); }
  } finally { await f.close(); }
});


test('embed delivery accessor uses the published snapshot with no page-time policy reads', async () => {
  for (const enabled of [true, false]) {
    const f = await fixture(enabled);
    try {
      assert.equal(f.deps.cookieConsent!.embedConsentOff?.(), !enabled);
      assert.equal(f.deps.cookieConsent!.embedConsentOff?.(), !enabled);
      assert.deepEqual(f.counts(), { reads: 0, regionReads: 0, draftReads: 0 });
    } finally { await f.close(); }
  }
});

test('embed delivery preserves the last good mode while refreshing and after failure', async () => {
  let fail = false;
  let release: (() => void) | undefined;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = { regionResolvers: async () => [] };
  const deps = { cookieConsent: consent, workspaceId: 'pending-embed-policy', siteConsentReady: Promise.resolve(), siteBinding: { dir: '/tmp/pending-embed-policy' }, clock: { nowMs: Date.now },
    consentStore: { readPublished: async () => { if (fail) throw new Error('fixture unavailable'); await new Promise<void>(resolve => { release = resolve; }); return { id: 'published', actorId: 'fixture', createdAt: '2026-11-05', config: { ...SITE_CONSENT_DEFAULTS, enabled: false, privacyPolicyUrl: '/privacy' } }; } },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  app.get('/embed-policy', (_req, res) => res.json({ consentOff: consent.embedConsentOff?.() }));
  const waitingPage = dispatchJsonRequest(app, 'GET', '/embed-policy');
  assert.equal(consent.embedConsentOff?.(), false);
  await new Promise<void>(resolve => setImmediate(resolve));
  release!();
  assert.deepEqual(await waitingPage, { status: 200, body: { consentOff: true } });
  assert.equal(consent.embedConsentOff?.(), true);
  fail = true;
  const refresh = consent.refresh!();
  assert.equal(consent.embedConsentOff?.(), true);
  await assert.rejects(refresh, /fixture unavailable/);
  assert.equal(consent.embedConsentOff?.(), true);
});

test('a refresh during document rendering keeps off-mode embeds active when the final assets omit the banner', async () => {
  let release: (() => void) | undefined;
  let pause = false;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = { regionResolvers: async () => [] };
  const deps = { cookieConsent: consent, workspaceId: 'render-refresh-policy', siteConsentReady: Promise.resolve(), siteBinding: { dir: '/tmp/render-refresh-policy' }, clock: { nowMs: Date.now },
    consentStore: { readPublished: async () => {
      if (pause) await new Promise<void>(resolve => { release = resolve; });
      return { id: 'published', actorId: 'fixture', createdAt: '2026-11-05', config: { ...SITE_CONSENT_DEFAULTS, enabled: false, privacyPolicyUrl: '/privacy' } };
    } },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  await consent.refresh!();
  app.get('/render', async (_req, res) => {
    pause = true;
    const pending = consent.refresh!();
    await new Promise<void>(resolve => setImmediate(resolve));
    const embedActive = consent.embedConsentOff?.();
    release!();
    await pending;
    const assets = await res.locals.siteConsentAssets({ scripts: [] });
    res.json({ embedActive, bannerPresent: assets.body.includes('jini-consent') });
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', '/render'), { status: 200, body: { embedActive: true, bannerPresent: false } });
});

test('embed delivery follows resolved policy while unrelated script declarations are pending', async () => {
  let release: (() => void) | undefined;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = {
    regionResolvers: async () => [],
    scriptDeclarations: async () => { await new Promise<void>(resolve => { release = resolve; }); return { scripts: [], problems: [] }; },
  };
  const deps = { cookieConsent: consent, workspaceId: 'slow-declarations', siteConsentReady: Promise.resolve(), siteBinding: { dir: '/tmp/slow-declarations' }, clock: { nowMs: Date.now },
    consentStore: { readPublished: async () => ({ id: 'published', actorId: 'fixture', createdAt: '2026-11-05', config: { ...SITE_CONSENT_DEFAULTS, enabled: false, privacyPolicyUrl: '/privacy' } }) },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  app.get('/embed-policy', (_req, res) => res.json({ consentOff: consent.embedConsentOff?.() }));
  await new Promise<void>(resolve => setImmediate(resolve));
  const page = await dispatchJsonRequest(app, 'GET', '/embed-policy');
  release!();
  assert.deepEqual(page, { status: 200, body: { consentOff: true } });
});

test('repeated mounts share one snapshot and its one read; publication reaches every app', async () => {
  let reads = 0;
  let releaseFirst: (() => void) | undefined;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = { regionResolvers: async () => [] };
  const deps = { cookieConsent: consent, workspaceId: 'remounted-policy', siteConsentReady: Promise.resolve(), siteBinding: { dir: '/tmp/remounted-policy' }, clock: { nowMs: Date.now },
    consentStore: { readPublished: async () => {
      const first = ++reads === 1;
      if (first) await new Promise<void>(resolve => { releaseFirst = resolve; });
      return { id: first ? 'old' : 'latest', actorId: 'fixture', createdAt: '2026-11-05', config: { ...SITE_CONSENT_DEFAULTS, enabled: first, privacyPolicyUrl: '/privacy' } };
    } },
  } as unknown as RouteDeps;
  const firstApp = express();
  const secondApp = express();
  const client = { src: '/_consent/fixture.js', body: Buffer.from('') };
  applySiteCookieConsent({ app: firstApp, deps, consent }, { client });
  await new Promise<void>(resolve => setImmediate(resolve));
  applySiteCookieConsent({ app: secondApp, deps, consent }, { client });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(reads, 1, 'a second build shares the read in flight');
  assert.equal(consent.embedConsentOff?.(), false);
  releaseFirst!();
  await consent.refresh!();
  await consent.refresh!();
  for (const app of [firstApp, secondApp]) app.get('/embed-policy', (_req, res) => res.json({ consentOff: consent.embedConsentOff?.() }));
  assert.deepEqual(await dispatchJsonRequest(firstApp, 'GET', '/embed-policy'), { status: 200, body: { consentOff: true } });
  assert.deepEqual(await dispatchJsonRequest(secondApp, 'GET', '/embed-policy'), { status: 200, body: { consentOff: true } });
  assert.equal(reads, 2);
});

/** Mutable publication and declarations exercise the real mounted construction hook. */
async function changingFixture({ preview = false, failAtBoot = false } = {}) {
  let now = 0, reads = 0, declarations = 0, failing = failAtBoot, enabled = false;
  let scripts: import('@jini-ai/cookie-consent').DeclaredScript[] = [{ src: '/ordinary.js' }, { src: '/optional.js', consent: ['analytics'] }];
  const consent = { regionResolvers: async () => [], scriptDeclarations: async () => { declarations++; return { scripts, problems: [] }; } };
  const deps = { cookieConsent: consent, workspaceId: 'refresh-policy', siteConsentReady: Promise.resolve(), siteBinding: { dir: '/tmp/refresh-policy' }, clock: { nowMs: () => now },
    consentStore: { readPublished: async () => { reads++; if (failing) throw new Error('fixture unavailable'); return { id: 'published', config: { ...SITE_CONSENT_DEFAULTS, enabled, privacyPolicyUrl: '/privacy' } }; } },
    consentAdapters: () => [{ adapter: { id: 'tracking', kind: 'consent-adapter', category: 'analytics', src: '/tracking.mjs' } }],
  } as unknown as RouteDeps;
  const app = express();
  if (preview) applyRenderThemeOverride(app, { themeId: 'preview-theme' });
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  app.get('/assets', async (_req, res) => res.json(await res.locals.siteConsentAssets({ scripts: [] })));
  await new Promise<void>(resolve => setImmediate(resolve));
  return { deps, app, counts: () => ({ reads, declarations }), set: (change: { now?: number; failing?: boolean; enabled?: boolean; scripts?: typeof scripts }) => {
    now = change.now ?? now; failing = change.failing ?? failing; enabled = change.enabled ?? enabled; scripts = change.scripts ?? scripts;
  } };
}

test('a failed construction policy retries after one minute and keeps ordinary declarations', async () => {
  const f = await changingFixture({ failAtBoot: true });
  const first = await dispatchJsonRequest(f.app, 'GET', '/assets');
  assert.equal(first.status, 200);
  assert.match((first.body as { head: string }).head, /ordinary.js/);
  assert.doesNotMatch((first.body as { head: string }).head, /optional.js/);
  assert.deepEqual(await f.deps.cookieConsent!.exportAssets!(), ['/ordinary.js']);
  assert.equal(await siteReceiptAllowsAnalytics({ deps: f.deps, proof: { receiptId: 'unread', policyVersion: 'unread' } }), false);
  assert.equal(f.counts().reads, 1);
  f.set({ failing: false, enabled: true, now: 59_999 });
  await dispatchJsonRequest(f.app, 'GET', '/assets');
  assert.equal(f.counts().reads, 1);
  f.set({ now: 60_000 });
  const recovered = await dispatchJsonRequest(f.app, 'GET', '/assets');
  assert.match((recovered.body as { body: string }).body, /id="jini-consent"/);
  assert.equal(f.counts().reads, 2);
});

test('context requests share the failed-policy retry window and recover at the minute boundary', async () => {
  const f = await changingFixture({ failAtBoot: true });
  assert.equal(f.counts().reads, 1);
  const first = await dispatchJsonRequest(f.app, 'GET', '/_consent/context');
  const second = await dispatchJsonRequest(f.app, 'GET', '/_consent/context');
  assert.equal(first.status, 503);
  assert.equal(second.status, 503);
  assert.equal(f.counts().reads, 1);
  f.set({ failing: false, enabled: true, now: 59_999 });
  assert.equal((await dispatchJsonRequest(f.app, 'GET', '/_consent/context')).status, 503);
  assert.equal(f.counts().reads, 1);
  f.set({ now: 60_000 });
  const recovered = await dispatchJsonRequest(f.app, 'GET', '/_consent/context');
  assert.equal(recovered.status, 200);
  assert.equal((recovered.body as { enabled: boolean }).enabled, true);
  assert.equal(f.counts().reads, 2);
});

test('off snapshots refresh settings and plugin declarations on the existing minute boundary', async () => {
  const f = await changingFixture();
  f.set({ scripts: [{ src: '/replacement.js' }] });
  assert.match(((await dispatchJsonRequest(f.app, 'GET', '/assets')).body as { head: string }).head, /ordinary.js/);
  f.set({ now: 60_000 });
  const pluginsChanged = (await dispatchJsonRequest(f.app, 'GET', '/assets')).body as { head: string };
  assert.match(pluginsChanged.head, /replacement.js/);
  assert.doesNotMatch(pluginsChanged.head, /ordinary.js/);
  f.set({ enabled: true, now: 120_000 });
  const stale = (await dispatchJsonRequest(f.app, 'GET', '/assets')).body as { body: string };
  assert.equal(stale.body, '', 'the request serves the last good snapshot while refreshing');
  await new Promise<void>(resolve => setImmediate(resolve));
  const enabled = (await dispatchJsonRequest(f.app, 'GET', '/assets')).body as { body: string };
  assert.match(enabled.body, /id="jini-consent"/);
  assert.equal(f.counts().reads, 3);
});

test('the real theme override hook withholds the banner and analytics adapters', async () => {
  const f = await changingFixture({ preview: true });
  f.set({ enabled: true });
  await f.deps.cookieConsent!.refresh!();
  const rendered = (await dispatchJsonRequest(f.app, 'GET', '/assets')).body as { head: string; body: string };
  assert.match(rendered.head, /ordinary.js/);
  assert.doesNotMatch(rendered.head + rendered.body, /jini-consent|tracking.mjs|optional.js/);
});

test('a stalled policy read cannot hold the page response open', { timeout: 1000 }, async () => {
  const consent = { regionResolvers: async () => [] };
  const deps = { cookieConsent: consent, workspaceId: 'stalled-policy', clock: { nowMs: Date.now },
    siteConsentReady: new Promise<void>(() => {}), siteBinding: { dir: '/tmp/stalled-policy' },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  app.get('/assets', async (_req, res) => res.json(await res.locals.siteConsentAssets({ scripts: [{ src: '/ordinary.js' }, { src: '/optional.js', consent: ['analytics'] }] })));
  const page = await dispatchJsonRequest(app, 'GET', '/assets');
  assert.equal(page.status, 200);
  assert.match((page.body as { head: string }).head, /ordinary.js/);
  assert.doesNotMatch((page.body as { head: string }).head, /optional.js/);
});


test('an owner settings write before first publication refreshes an off construction snapshot', async () => {
  const settingsRepo = new InMemorySettingsRepo();
  let now = 0, id = 0;
  const clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const ids = { newId: () => `setting-${++id}` };
  const principals = { findActiveById: async ({ id }: { id: string }) => ({ id }) };
  const authorize = async () => ({ allowed: true as const, reason: 'fixture owner' });
  await ensureSiteConsentDefinitions({ settingsRepo, clock, ids, principals }, { systemPrincipalId: 'system' });
  const consent = { regionResolvers: async () => [] };
  const deps = { settingsRepo, workspaceId: 'legacy-settings', clock, cookieConsent: consent, siteConsentReady: Promise.resolve(),
    consentStore: { readPublished: async () => null }, siteBinding: { dir: '/tmp/legacy-settings' },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  await deps.cookieConsent!.refresh!();
  app.get('/assets', async (_req, res) => res.json(await res.locals.siteConsentAssets({ scripts: [] })));
  assert.equal(((await dispatchJsonRequest(app, 'GET', '/assets')).body as { body: string }).body, '');
  await set({ deps: { repo: settingsRepo, clock, ids, principals, authorize }, input: {
    namespace: SITE_CONSENT_NAMESPACE, key: 'enabled', value: true, scope: 'workspace', workspaceId: deps.workspaceId, callerPrincipalId: 'owner',
  } });
  now = 60_000;
  assert.equal(((await dispatchJsonRequest(app, 'GET', '/assets')).body as { body: string }).body, '', 'the request serves the last good snapshot while refreshing');
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.match(((await dispatchJsonRequest(app, 'GET', '/assets')).body as { body: string }).body, /id="jini-consent"/);
});


test('slow initial readiness does not discard a late successful policy', { timeout: 2000 }, async () => {
  let release!: () => void;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = { regionResolvers: async () => [] };
  const deps = { cookieConsent: consent, workspaceId: 'late-policy', clock: { nowMs: Date.now },
    siteConsentReady: new Promise<void>(resolve => { release = resolve; }), siteBinding: { dir: '/tmp/late-policy' },
    consentStore: { readPublished: async () => ({ id: 'late', config: { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' } }) },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  const request = { header: () => '1' } as unknown as import('express').Request;
  assert.equal((await siteConsentDocumentAssets({ deps, request, scripts: [] })).body, '');
  assert.match(await consent.exportWarning!() ?? '', /no cookie banner/);
  release();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.match((await siteConsentDocumentAssets({ deps, request, scripts: [] })).body, /id="jini-consent"/);
});

test('refresh serves last good assets immediately while a newer policy is pending', { timeout: 2000 }, async () => {
  const f = await fixture(true);
  let release!: () => void;
  f.deps.consentStore!.readPublished = async () => { await new Promise<void>(resolve => { release = resolve; }); return null; };
  try {
    const refreshing = f.deps.cookieConsent!.refresh!();
    await new Promise<void>(resolve => setImmediate(resolve));
    const assets = await siteConsentDocumentAssets({ deps: f.deps, request: { header: () => undefined } as unknown as import('express').Request, scripts: [] });
    assert.match(assets.body, /id="jini-consent"/);
    release();
    await refreshing.catch(() => {});
  } finally { await f.close(); }
});


test('missing browser bundles warn without stopping route mounting', async t => {
  const fs = await import('node:fs');
  const { syncBuiltinESMExports } = await import('node:module');
  const original = fs.default.readFileSync;
  const read = t.mock.method(fs.default, 'readFileSync', ((file: unknown, ...args: unknown[]) => {
    if (String(file).endsWith('extensions.min.js') || String(file).endsWith('client.min.js')) throw new Error('fixture missing bundle');
    return (original as (...values: unknown[]) => unknown)(file, ...args);
  }) as typeof original);
  const warnings = t.mock.method(console, 'warn', () => {});
  syncBuiltinESMExports();
  t.after(() => { read.mock.restore(); syncBuiltinESMExports(); });
  const consent = { regionResolvers: async () => [] };
  const deps = { cookieConsent: consent, workspaceId: 'missing-bundles', clock: { nowMs: Date.now }, siteBinding: { dir: '/tmp/missing-bundles' }, siteConsentReady: new Promise<void>(() => {}) } as unknown as RouteDeps;
  const app = express();
  assert.doesNotThrow(() => applySiteCookieConsent({ app, deps, consent }));
  assert.equal((await dispatchHttpRequest({ app, method: 'GET', url: '/_consent/extensions.min.js' })).status, 404);
  assert.equal(warnings.mock.calls.length, 2);
});

test('a declaration failure does not release a still-running policy read for another refresh', { timeout: 3000 }, async () => {
  let now = 0, reads = 0;
  let release!: () => void;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = { regionResolvers: async () => [], scriptDeclarations: async () => { throw new Error('fixture declaration failure'); } };
  const deps = { cookieConsent: consent, workspaceId: 'pending-policy-declarations', siteConsentReady: Promise.resolve(), clock: { nowMs: () => now }, siteBinding: { dir: '/tmp/pending-policy-declarations' },
    consentStore: { readPublished: async () => { reads++; await new Promise<void>(resolve => { release = resolve; }); return { id: 'late', config: { ...SITE_CONSENT_DEFAULTS, enabled: false, privacyPolicyUrl: '/privacy' } }; } },
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
  await new Promise<void>(resolve => setImmediate(resolve));
  now = 60_000;
  await dispatchJsonRequest(app, 'GET', '/_consent/context');
  assert.equal(reads, 1);
  release();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(consent.embedConsentOff?.(), true);
});

test('a later export run does not retain the previous run unavailable-policy warning', async () => {
  let ready!: () => void;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = { regionResolvers: async () => [] };
  const deps = { cookieConsent: consent, workspaceId: 'export-warning-reset', siteConsentReady: new Promise<void>(resolve => { ready = resolve; }), clock: { nowMs: Date.now }, siteBinding: { dir: '/tmp/export-warning-reset' },
    consentStore: { readPublished: async () => ({ id: 'published', config: { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' } }) },
  } as unknown as RouteDeps;
  const client = { src: '/_consent/fixture.js', body: Buffer.from('') };
  applySiteCookieConsent({ app: express(), deps, consent }, { client });
  assert.match(await consent.exportWarning!() ?? '', /no cookie banner/);
  ready();
  applySiteCookieConsent({ app: express(), deps, consent }, { client });
  await consent.refresh!();
  assert.equal(await consent.exportWarning!(), undefined);
});

function goodPolicyFixture(workspaceId: string, extra: Partial<import('#src/contracts/headless/index').SiteCookieConsentDeps> = {}) {
  let failing = false, reads = 0;
  const consent: import('#src/contracts/headless/index').SiteCookieConsentDeps = { regionResolvers: async () => [], ...extra };
  const deps = { cookieConsent: consent, workspaceId, siteConsentReady: Promise.resolve(), clock: { nowMs: Date.now }, siteBinding: { dir: `/tmp/${workspaceId}` },
    consentStore: { readPublished: async () => { reads++; if (failing) throw new Error('fixture unavailable'); return { id: 'good', config: { ...SITE_CONSENT_DEFAULTS, enabled: true, privacyPolicyUrl: '/privacy' } }; } },
  } as unknown as RouteDeps;
  const mount = () => {
    const app = express();
    applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/fixture.js', body: Buffer.from('') } });
    app.get('/assets', async (_req, res) => res.json(await res.locals.siteConsentAssets({ scripts: [] })));
    return app;
  };
  return { consent, deps, mount, reads: () => reads, fail: (value: boolean) => { failing = value; } };
}

test('another app build for the same site keeps the live policy when the store then fails', { timeout: 2000 }, async t => {
  t.mock.method(console, 'warn', () => {});
  const f = goodPolicyFixture('rebuilt-site');
  const live = f.mount();
  await f.consent.refresh!();
  f.fail(true);
  const exportApp = f.mount();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.match(((await dispatchJsonRequest(live, 'GET', '/assets')).body as { body: string }).body, /id="jini-consent"/);
  assert.match(((await dispatchJsonRequest(exportApp, 'GET', '/assets')).body as { body: string }).body, /id="jini-consent"/);
  assert.equal(f.reads(), 1, 'an app build reads nothing for a site that already has its snapshot');
});

test('an export warning is answered for that run from the policy it will render with', { timeout: 2000 }, async t => {
  t.mock.method(console, 'warn', () => {});
  const f = goodPolicyFixture('export-run-warning');
  f.fail(true);
  f.mount();
  assert.match(await f.consent.exportWarning!() ?? '', /no cookie banner/);
  f.fail(false);
  assert.equal(await f.consent.exportWarning!(), undefined, 'a run starts from a fresh read');
  f.fail(true);
  assert.equal(await f.consent.exportWarning!(), undefined, 'a failed read keeps the last good policy, so the copy has its banner');
});

test('a failed plugin declaration load keeps the last good scripts and does not fail a refresh', { timeout: 2000 }, async t => {
  t.mock.method(console, 'warn', () => {});
  let failing = false;
  const f = goodPolicyFixture('declaration-last-good', { scriptDeclarations: async () => {
    if (failing) throw new Error('fixture contribution failure');
    return { scripts: [{ src: '/ordinary.js' }], problems: [] };
  } });
  const app = f.mount();
  await f.consent.refresh!();
  failing = true;
  await f.consent.refresh!();
  const assets = (await dispatchJsonRequest(app, 'GET', '/assets')).body as { head: string; body: string };
  assert.match(assets.head + assets.body, /ordinary\.js/);
});

test('the authored loader keeps declared optional scripts in client configuration until approval', async () => {
  const f = await fixture(true, async () => ({ scripts: [{ src: '/stats.js', consent: ['analytics'] }], problems: [] }));
  try {
    const response = await fetch(`${f.url}/_consent/load.js`);
    assert.equal(response.status, 200);
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<html><head></head><body>Static document</body></html>', { url: f.url, runScripts: 'outside-only' });
    try {
      dom.window.eval(await response.text());
      assert.equal(dom.window.document.querySelector('script[src="/stats.js"]'), null);
      assert.deepEqual(JSON.parse(dom.window.document.getElementById('jini-consent-config')!.textContent!).scripts, [{ src: '/stats.js', consent: ['analytics'] }]);
    } finally { dom.window.close(); }
  } finally { await f.close(); }
});

test('a failed active-theme read returns plain words from the loader without leaking details', async t => {
  const f = await fixture(true);
  t.mock.method(console, 'error', () => {});
  f.deps.resolveActiveThemeId = async () => { throw new Error('private-theme-path'); };
  try {
    const response = await fetch(`${f.url}/_consent/load.js`);
    assert.equal(response.status, 503);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    const body = await response.text();
    assert.match(body, /Cookie preferences could not be loaded/);
    assert.doesNotMatch(body, /private-theme-path/);
  } finally { await f.close(); }
});


test('an older authored consent loader remains harmless when consent is disabled', async () => {
  const f = await fixture(false);
  const page = '<html><head><script src="/_consent/load.js" defer data-jini-consent-loader></script></head><body>Older theme</body></html>';
  f.app.get('/older-theme', (_req, res) => res.type('html').send(page));
  try {
    assert.equal(await (await fetch(`${f.url}/older-theme`)).text(), page, 'authored documents are not rewritten');
    const context = await (await fetch(`${f.url}/_consent/context`)).json() as { enabled: boolean };
    assert.equal(context.enabled, false);
    const response = await fetch(`${f.url}/_consent/load.js`);
    assert.equal(response.status, 200);
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(page, { url: f.url, runScripts: 'outside-only' });
    try {
      dom.window.eval(await response.text());
      assert.equal(dom.window.document.getElementById('jini-consent'), null);
      assert.equal(dom.window.document.getElementById('jini-consent-config'), null);
      assert.equal(dom.window.document.querySelectorAll('script').length, 1, 'the old tag loads no consent runtime');
    } finally { dom.window.close(); }
  } finally { await f.close(); }
});


test('static documents with consent off deliver declared scripts directly and export their local assets', async () => {
  const f = await fixture(false, async () => ({ scripts: [
    { src: '/plugin-menu.js' }, { src: '/plugin-optional.js', consent: ['analytics'] },
    { src: 'https://example.com/plugin.js' },
  ], problems: [] }));
  f.app.get('/static-assets', async (req, res) => res.json(await siteConsentDocumentAssets({
    deps: f.deps, request: req, static: true,
    scripts: [{ src: '/theme-menu.js' }, { src: '/theme-optional.js', consent: ['functional'] }],
  })));
  try {
    const assets = await (await fetch(`${f.url}/static-assets`)).json() as { head: string; body: string };
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(`<html><head>${assets.head}</head><body>${assets.body}</body></html>`);
    try {
      assert.deepEqual([...dom.window.document.querySelectorAll('script')].map(script => script.getAttribute('src')),
        ['/theme-menu.js', '/theme-optional.js', '/plugin-menu.js', '/plugin-optional.js', 'https://example.com/plugin.js']);
      assert.equal(assets.body, '');
      assert.doesNotMatch(assets.head, /_consent|jini-consent/);
      assert.deepEqual(await f.deps.cookieConsent!.exportAssets!(), ['/plugin-menu.js', '/plugin-optional.js']);
    } finally { dom.window.close(); }
  } finally { await f.close(); }
});

test('a static document with consent off and no declared scripts adds nothing', async () => {
  const f = await fixture(false);
  f.app.get('/static-assets', async (req, res) => res.json(await siteConsentDocumentAssets({ deps: f.deps, request: req, static: true, scripts: [] })));
  try {
    assert.deepEqual(await (await fetch(`${f.url}/static-assets`)).json(), { head: '', body: '' });
    assert.deepEqual(await f.deps.cookieConsent!.exportAssets!(), []);
  } finally { await f.close(); }
});
