import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { applySiteCookieConsent, siteConsentDocumentAssets, readSiteVisitorConsent, readSiteAnalyticsProof, siteReceiptAllowsAnalytics } from '../site-cookie-consent.js';
import { SITE_CONSENT_DEFAULTS } from '#src/features/consent/config';
import type { RouteDeps } from '#src/server/routes/types';

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
    assert.equal(reads, 0);
    assert.deepEqual(f.counts(), { reads: 0, regionReads: 0, draftReads: 0 });
  } finally { await f.close(); }
});
