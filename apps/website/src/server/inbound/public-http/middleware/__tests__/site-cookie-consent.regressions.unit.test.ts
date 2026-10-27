/** @file Lot N regressions: native HTTP/Express in memory, without listening sockets or vendor calls. */
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import express, { type Express } from 'express';
import { CONSENT_COOKIE } from '@jini-ai/cookie-consent';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import type { RouteDeps } from '#src/server/routes/types';
import { applySiteCookieConsent, captureHtml } from '../site-cookie-consent.js';

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
    captureHtml({ res, transform: async ({ html }) => { transforms++; return html + '<!-- banner -->'; } });
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
