import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { applySiteCookieConsent, siteConsentDocumentAssets, readSiteVisitorConsent, readSiteAnalyticsProof, siteReceiptAllowsAnalytics } from '../site-cookie-consent.js';
import { SITE_CONSENT_DEFAULTS } from '#src/features/consent/config';
import type { RouteDeps } from '#src/server/routes/types';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';

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
  return { deps, page, url: `http://127.0.0.1:${address.port}`, counts: () => ({ reads, regionReads, draftReads }), close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
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

test('one no-store context request reads publication only and resolves region once', async () => {
  const f = await fixture(true);
  try {
    const response = await fetch(`${f.url}/_consent/context`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.deepEqual(await response.json(), { enabled: true, policy: '1:published', regionMode: 'auto' });
    assert.deepEqual(f.counts(), { reads: 1, regionReads: 1, draftReads: 0 });
  } finally { await f.close(); }
});

test('enabled document slots include a native withdrawal link and both browser assets', async () => {
  const f = await fixture(true);
  try {
    const response = await fetch(`${f.url}/assets`);
    const assets = await response.json() as { head: string; body: string };
    assert.match(assets.head, /client-test\.min\.js/);
    assert.match(assets.head, /extensions\.min\.js/);
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

test('embed delivery remains inert while policy refresh is pending or fails', async () => {
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
  assert.equal(consent.embedConsentOff?.(), false);
  await assert.rejects(refresh, /fixture unavailable/);
  assert.equal(consent.embedConsentOff?.(), false);
});
