/** @file Lot N regressions: native HTTP/Express in memory, without listening sockets or vendor calls. */
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express, { type Express, type Request } from 'express';
import { CONSENT_COOKIE } from '@jini-ai/cookie-consent';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import type { RouteDeps } from '#src/server/routes/types';
import { applySiteCookieConsent, readSiteVisitorConsent, readSiteAnalyticsProof, siteReceiptAllowsAnalytics, siteConsentDocumentAssets } from '../site-cookie-consent.js';
import { captureHtmlResponse } from '@jini-ai/http-kit/html-response';

/** Same native transport as helpers/in-process-http, but retain headers/bytes and inject the peer.
 * Its JSON-only dispatcher cannot observe HEAD or the collector's empty 429 response. */
async function dispatch({ app, method, url, address = '2001:db8:abcd:1234::1', headers = {} }: {
  app: Express; method: string; url: string; address?: string; headers?: Record<string, string>;
}, _options = {}) {
  const socket = new PassThrough();
  Object.defineProperty(socket, 'remoteAddress', { value: address });
  const req = new IncomingMessage(socket as unknown as Socket);
  req.method = method;
  req.url = url;
  req.headers = { host: 'site.example', ...headers };
  req.push(null);
  const res = new ServerResponse(req);
  res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = [];
  socket.on('data', (chunk: Buffer) => chunks.push(chunk));
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Consent request did not finish')), 1000);
      res.once('finish', resolve);
      res.once('error', reject);
      app(req, res);
    });
    const wire = Buffer.concat(chunks);
    return { status: res.statusCode, headers: res.getHeaders(), body: wire.subarray(wire.indexOf('\r\n\r\n') + 4) };
  } finally {
    clearTimeout(deadline);
    socket.destroy();
  }
}

test('T40: end-only HTML over 4 MiB and empty HEAD responses pass through with their validators', async () => {
  const app = express();
  let transforms = 0;
  app.use((_req, res, next) => {
    captureHtmlResponse({ response: res, transform: async ({ body }) => { transforms++; return Buffer.concat([body, Buffer.from('<!-- contribution -->')]); } }, { maxBytes: 4 * 1024 * 1024 });
    next();
  });
  const oversized = Buffer.alloc(4 * 1024 * 1024 + 1, 'x');
  app.get('/large', (_req, res) => res.type('html').set('ETag', '"large-original"').send(oversized));
  app.head('/empty', (_req, res) => res.type('html').set({ 'Content-Length': '123', ETag: '"head-original"' }).end());

  const large = await dispatch({ app, method: 'GET', url: '/large' });
  const head = await dispatch({ app, method: 'HEAD', url: '/empty' });
  assert.equal(large.status, 200);
  assert.equal(head.status, 200);
  assert.deepEqual({
    oversizedBytesUnchanged: large.body.equals(oversized),
    oversizedLength: large.headers['content-length'],
    oversizedEtag: large.headers.etag,
    headBodyBytes: head.body.length,
    headLength: head.headers['content-length'],
    headEtag: head.headers.etag,
    transforms,
  }, {
    oversizedBytesUnchanged: true,
    oversizedLength: String(oversized.length),
    oversizedEtag: '"large-original"',
    headBodyBytes: 0,
    headLength: '123',
    headEtag: '"head-original"',
    transforms: 0,
  });
});

test('T41: collector requests from rotating IPv6 addresses share one /64 rate budget', async t => {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const now = Date.parse('2026-10-26T12:00:00.000Z');
  const calls: unknown[] = [];
  const deps = {
    consentStore: f.store,
    siteConsentReady: Promise.resolve(),
    // Receipt adapters are registered but never called by collector requests.
    siteBinding: { dir: '/unused-consent-fixture' },
    clock: { nowMs: () => now, nowIso: () => new Date(now).toISOString() },
    consentAdapters: ({ base }: { base: string }) => [{
      adapter: { id: 'fixture', kind: 'consent-adapter', category: 'analytics', src: `${base}/fixture/adapter.mjs` },
      http: { path: `${base}/fixture`, handle: async (input: unknown) => { calls.push(input); return { status: 200, body: 'accepted' }; } },
    }],
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent: { regionResolvers: async () => [] } }, {
    client: { src: '/_consent/client-fixture.min.js', body: Buffer.from('/* fixture */') },
  });
  const cookie = CONSENT_COOKIE + '=' + encodeURIComponent(JSON.stringify({
    v: 1, p: `${f.config.policyVersion}:${saved.revision.id}`, t: now, a: 'accept',
    c: { functional: true, analytics: true, marketing: true }, r: 'receipt_fixture_0123456789',
  }));
  const previousOrigin = process.env.TOVU_PUBLIC_URL;
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previousOrigin;
  });
  process.env.TOVU_PUBLIC_URL = 'http://site.example';
  const send = (address: string) => dispatch({ app, method: 'POST', url: '/_consent/p/fixture/collect', address,
    headers: { origin: 'http://site.example', cookie } });

  // The collector allows max (120) + burst (20) in its fixed 60-second window.
  for (let count = 0; count < 140; count++) {
    assert.equal((await send('2001:db8:abcd:1234::1')).status, 200, `request ${count + 1}`);
  }
  assert.equal((await send('2001:db8:abcd:1234::1')).status, 429, 'the original address has exhausted its budget');
  const rotated = await send('2001:db8:abcd:1234::2');
  const unrelated = await send('2001:db8:abcd:1235::1');
  assert.deepEqual({ rotatedStatus: rotated.status, unrelatedStatus: unrelated.status, delivered: calls.length }, {
    rotatedStatus: 429, unrelatedStatus: 200, delivered: 141,
  });
});


test('retired receipt and declined collector refuse delivery; non-full proofs read the cookie only once', async t => {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const directory = await mkdtemp(path.join(tmpdir(), 'x4-consent-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const now = Date.parse('2026-10-26T12:00:00.000Z');
  const policyVersion = `${f.config.policyVersion}:${saved.revision.id}`;
  const id = 'receipt_fixture_0123456789';
  await mkdir(path.join(directory, 'consent-receipts'));
  const receiptPath = path.join(directory, 'consent-receipts', `${id}.json`);
  await writeFile(receiptPath, JSON.stringify({ id, policyVersion, gpc: false, choices: { analytics: true }, timestamp: new Date(now).toISOString() }));
  let deliveries = 0;
  const consent = { regionResolvers: async () => [] };
  const deps = { consentStore: f.store, siteConsentReady: Promise.resolve(), siteBinding: { dir: directory }, cookieConsent: consent,
    clock: { nowMs: () => now, nowIso: () => new Date(now).toISOString() },
    consentAdapters: ({ base }: { base: string }) => [{ adapter: { id: 'fixture', kind: 'consent-adapter', category: 'analytics', src: `${base}/fixture/adapter.mjs` },
      http: { path: `${base}/fixture`, handle: async () => { deliveries++; return { status: 200, body: 'accepted' }; } } }],
  } as unknown as RouteDeps;
  const app = express();
  applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/client-fixture.min.js', body: Buffer.from('') } });
  assert.equal(await siteReceiptAllowsAnalytics({ deps, proof: { receiptId: id, policyVersion } }), true);
  await unlink(receiptPath);
  assert.equal(await siteReceiptAllowsAnalytics({ deps, proof: { receiptId: id, policyVersion } }), false);
  const previousOrigin = process.env.TOVU_PUBLIC_URL;
  t.after(() => { if (previousOrigin === undefined) delete process.env.TOVU_PUBLIC_URL; else process.env.TOVU_PUBLIC_URL = previousOrigin; });
  process.env.TOVU_PUBLIC_URL = 'http://site.example';
  const cookie = CONSENT_COOKIE + '=' + encodeURIComponent(JSON.stringify({ v: 1, p: policyVersion, t: now, a: 'reject', c: { functional: false, analytics: false, marketing: false }, r: id }));
  const denied = await dispatch({ app, method: 'POST', url: '/_consent/p/fixture/collect', headers: { origin: 'http://site.example', cookie } });
  assert.equal(denied.status, 403); assert.equal(deliveries, 0);
  let reads = 0;
  const req = { get: (name: string) => { if (name === 'cookie') { reads++; return cookie; } return undefined; } } as unknown as Request;
  assert.equal(await readSiteAnalyticsProof({ deps, req }), undefined);
  assert.equal(reads, 1);
  const preview = await siteConsentDocumentAssets({ deps, request: { ...req, res: { locals: { renderThemeIdOverride: 'preview' } } } as unknown as Request,
    scripts: [{ src: '/ordinary.js' }, { src: '/optional.js', consent: ['analytics'] }] });
  assert.match(preview.head, /ordinary.js/); assert.doesNotMatch(preview.head, /optional.js|jini-consent-config/); assert.equal(preview.body, '');
});

test('two app builds share one pending refresh and off-mode assets and consent do not read visitor cookies', async t => {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled: false }, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  let reads = 0;
  const readPublished = f.store.readPublished.bind(f.store);
  const consent = { regionResolvers: async () => [], scriptDeclarations: async () => ({ scripts: [], problems: [] }) };
  const deps = { consentStore: { ...f.store, readPublished: async () => { reads++; await held; return readPublished({}); } },
    siteConsentReady: Promise.resolve(), siteBinding: { dir: '/unused-consent-fixture' }, cookieConsent: consent,
    clock: { nowMs: () => 1_800_000_000_000, nowIso: () => '2027-01-15T08:00:00.000Z' },
  } as unknown as RouteDeps;
  for (const app of [express(), express()]) applySiteCookieConsent({ app, deps, consent }, { client: { src: '/_consent/client-fixture.min.js', body: Buffer.from('') } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(reads, 1);
  release();
  const req = { get: (name: string) => { if (name === 'cookie') throw new Error('off mode read consent cookie'); return undefined; }, headers: {}, query: {} } as unknown as Request;
  const state = await readSiteVisitorConsent({ deps, req });
  assert.equal(state.analyticsLevel, 'anonymous');
  const assets = await siteConsentDocumentAssets({ deps, request: req, scripts: [{ src: '/ordinary.js' }] });
  assert.match(assets.head, /ordinary.js/); assert.equal(assets.body, '');
  const preview = await siteConsentDocumentAssets({ deps, request: { ...req, res: { locals: { renderThemeIdOverride: 'preview' } } } as unknown as Request, scripts: [{ src: '/ordinary.js' }] });
  assert.match(preview.head, /ordinary.js/); assert.equal(preview.body, '');
});
