/** Browser collector admission uses the published consent owner, never retired receipt cookies. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express, Request, RequestHandler, Response } from 'express';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import { createRouteDeps } from '../app.js';
import { applyBrowserAnalyticsHttp } from '../browser-analytics-http.js';

test('generic site collectors require full analytics; assets, origin checks and rate limits remain', async t => {
  const f = consentFixture({ t });
  const saved = await f.service.saveDraft({ principalId: 'owner', config: f.config, expectedDraftId: null });
  await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
  const calls: unknown[] = [];
  let handler!: RequestHandler;
  const deps = { ...createRouteDeps(), consentStore: f.store, siteConsentReady: Promise.resolve(), cookieConsent: { regionResolvers: async () => [] },
    browserAnalytics: () => [{ source: 'function(){}', origins: [], supportsStatic: false,
      http: { path: '/_jini/browser-analytics/site/fixture', handle: async (input: unknown) => { calls.push(input); return { status: 204, body: '' }; } } }] };
  const app = { use(_path: string, _raw: RequestHandler, next: RequestHandler) { handler = next; } } as unknown as Express;
  applyBrowserAnalyticsHttp({ app, deps });
  const headers: Record<string, string> = { host: 'site.example', origin: 'http://site.example' };
  async function request(method = 'POST') {
    let status = 200;
    const response = { setHeader() {}, status(value: number) { status = value; return this; }, end() {} } as unknown as Response;
    await handler({ path: '/site/fixture/event', method, headers, protocol: 'http', socket: { remoteAddress: '192.0.2.10' },
      get: (name: string) => headers[name], body: Buffer.from('event') } as unknown as Request, response, () => {});
    return status;
  }
  assert.equal(await request('GET'), 204, 'inert provider assets remain accessible');
  for (const cookie of ['', 'jini_consent=retired_receipt_0123456789']) {
    headers.cookie = cookie;
    assert.equal(await request(), 403);
  }
  headers.cookie = 'jini_region=us';
  assert.equal(await request(), 204, 'the published auto policy grants full analytics in US opt-out regions');
  headers.dnt = '1'; assert.equal(await request(), 403); delete headers.dnt;
  headers['sec-gpc'] = '1'; assert.equal(await request(), 403); delete headers['sec-gpc'];
  headers.origin = 'https://other.example'; assert.equal(await request(), 403);
  headers.origin = 'http://site.example';
  for (let i = 1; i < 140; i++) assert.equal(await request(), 204);
  assert.equal(await request(), 429, 'collection keeps the existing fixed-window budget');
  assert.equal(calls.length, 141, 'denied requests never invoke the provider');
  assert.equal(JSON.stringify(calls).includes('jini_region'), false, 'cookies stay inside the host');
  const disabled = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled: false }, expectedDraftId: saved.revision.id });
  await f.service.publish({ principalId: 'owner', draftId: disabled.revision.id, expectedPublishedId: saved.revision.id });
  assert.equal(await request(), 403, 'generic collectors cannot deliver anonymous-only off-mode analytics');
  assert.equal(calls.length, 141);
});
