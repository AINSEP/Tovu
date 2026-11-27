/** Browser collector admission uses the published consent owner, never retired receipt cookies. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { InMemorySettingsRepo } from '@jini-ai/core/settings';
import { createNoopObservabilityPort, type MetricInput, type MetricOptions } from '@jini-ai/core/contracts/observability';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
import { startTestServer, loginAsBarePrincipal } from '#src/server/__tests__/helpers/http-test-server';
import { createRouteIncidentReporter } from '#src/server/__tests__/helpers/route-incident-reporter';
import { registerAuthRoutes } from '../../../inbound/admin-http/dev-auth.js';
import { TELEMETRY_CONSENT } from '../telemetry-consent.js';
import { consentFixture } from '#src/features/consent/__tests__/fixture';
import { createRouteDeps } from '../app.js';
import { applyBrowserAnalyticsHttp } from '../browser-analytics-http.js';

test('provider asset delivery preserves types and cache hints, while unclaimed paths and provider faults stay distinct', async t => {
  const calls: unknown[] = [];
  const asset = '/_jini/browser-analytics/site/example';
  const app = express();
  const deps = { ...createRouteDeps(), browserAnalytics: ({ surface }: { surface: string }) => {
    assert.equal(surface, 'site');
    return [{ source: '', origins: [], supportsStatic: false, http: { path: asset, handle: async (input: { path: string }) => {
      calls.push(input);
      if (input.path === '/fault') throw new Error('upstream-private-detail');
      assert.equal(input.path, '/client.js');
      return { status: 200, body: '/* browser asset */', contentType: 'application/javascript', cacheControl: 'public, max-age=120' };
    } } }];
  } };
  applyBrowserAnalyticsHttp({ app, deps });
  app.get('/_jini/browser-analytics/other', (_req, res) => { res.status(202).send('next route'); });
  const baseUrl = await startTestServer(app, t);

  const found = await fetch(baseUrl + asset + '/client.js?cache=v2');
  assert.equal(found.status, 200);
  assert.equal(found.headers.get('content-type'), 'application/javascript');
  assert.equal(found.headers.get('cache-control'), 'public, max-age=120');
  assert.equal(await found.text(), '/* browser asset */');
  assert.deepEqual(calls, [{ method: 'GET', path: '/client.js', body: new Uint8Array(), contentType: 'application/octet-stream' }]);

  const missing = await fetch(baseUrl + asset + '-other/client.js');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'private, no-store');
  assert.equal(await missing.text(), '');
  assert.equal(calls.length, 1);
  const other = await fetch(baseUrl + '/_jini/browser-analytics/other');
  assert.equal(other.status, 202);
  assert.equal(await other.text(), 'next route');
  assert.equal(calls.length, 1);

  const fault = await fetch(baseUrl + asset + '/fault');
  assert.equal(fault.status, 502);
  assert.equal(await fault.text(), '');
  assert.deepEqual(calls[1], { method: 'GET', path: '/fault', body: new Uint8Array(), contentType: 'application/octet-stream' });
});

test('admin collection requires same origin, an authenticated session and live metrics consent', async t => {
  const previousOrigin = process.env.TOVU_PUBLIC_URL;
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previousOrigin;
  });
  process.env.TOVU_PUBLIC_URL = 'http://localhost:3000';
  const deps = createRouteDeps();
  const repo = new InMemorySettingsRepo();
  await deps.settingsReady;
  deps.settingsRepo = repo;
  const workspaceId = deps.workspaceId, now = '2026-11-20T00:00:00Z';
  await repo.saveDefinition({ settingId: 'test-admin-metrics', version: 1, workspaceId: null, ...TELEMETRY_CONSENT,
    ownerKind: 'core', ownerId: null, schema: { type: 'boolean' }, defaultValue: false, scopes: 2, secret: false,
    status: 'active', aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: now, updatedAt: now });
  const calls: unknown[] = [];
  const collector = '/_jini/browser-analytics/admin/report';
  deps.browserAnalytics = ({ surface }) => surface === 'admin' ? [{ source: '', origins: [], supportsStatic: false,
    http: { path: collector, handle: async input => {
      calls.push(input);
      return { status: 202, body: 'accepted', cacheControl: 'public, max-age=900' };
    } } }] : [];
  const app = express();
  // why: login needs a parsed JSON body; scoped so the collector below still sees its raw bytes.
  app.use('/api/admin/v1/auth', express.json());
  registerAuthRoutes({ app, deps, errors: createRouteIncidentReporter().errors });
  applyBrowserAnalyticsHttp({ app, deps });
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl, { username: 'metrics-operator' });
  assert.match(cookie, /^tovu_session=.+/);
  const send = (headers: Record<string, string>) => fetch(baseUrl + collector + '/event', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{"duration":73}',
  });
  const off = await send({ origin: baseUrl, cookie });
  assert.equal(off.status, 403);
  assert.equal(await off.text(), '');
  await repo.saveWorkspaceValue({ settingId: 'test-admin-metrics', scope: 'workspace', workspaceId, principalId: null,
    valueJson: true, state: 'set', defVersion: 1, seq: 1, updatedBy: 'metrics-operator', updatedAt: now, originPluginId: null });
  const refusedHeaders: Record<string, string>[] = [{ origin: baseUrl }, { origin: 'null', cookie }, { cookie }];
  for (const headers of refusedHeaders) {
    const refused = await send(headers);
    assert.equal(refused.status, 403);
    assert.equal(await refused.text(), '');
  }
  assert.deepEqual(calls, []);
  const accepted = await send({ origin: baseUrl, cookie });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers.get('cache-control'), 'private, no-store');
  assert.equal(await accepted.text(), 'accepted');
  assert.deepEqual(calls, [{ method: 'POST', path: '/event', body: Buffer.from('{"duration":73}'), contentType: 'application/json' }]);
});

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

for (const scenario of [
  { name: 'default off', body: '{"navigationMs":12}', status: 404, off: true },
  { name: 'missing metrics capability', body: '{"navigationMs":12}', status: 404, noMetrics: true },
  { name: 'full consent navigation', body: '{"navigationMs":12}', status: 204, metric: { input: { name: 'browser.navigation.duration', value: 12 }, options: { kind: 'histogram', unit: 'ms', attributes: { surface: 'site' } } } },
  { name: 'navigation upper bound', body: '{"navigationMs":600000}', status: 204, metric: { input: { name: 'browser.navigation.duration', value: 600000 }, options: { kind: 'histogram', unit: 'ms', attributes: { surface: 'site' } } } },
  { name: 'error', body: '{"errorKind":1}', status: 204, metric: { input: { name: 'browser.error', value: 1 }, options: { kind: 'counter', attributes: { surface: 'site' } } } },
  { name: 'unhandled rejection', body: '{"errorKind":2}', status: 204, metric: { input: { name: 'browser.unhandled_rejection', value: 1 }, options: { kind: 'counter', attributes: { surface: 'site' } } } },
  { name: 'anonymous consent', body: '{"navigationMs":12}', status: 403, anonymous: true },
  { name: 'withdrawn consent', body: '{"navigationMs":12}', status: 403, withdrawn: true },
  { name: 'foreign origin', body: '{"navigationMs":12}', status: 403, origin: 'https://other.example' },
  { name: 'rate exhaustion', body: '{"navigationMs":12}', status: 429, exhausted: true },
  { name: 'non POST', body: '{"navigationMs":12}', status: 404, method: 'GET' },
  { name: 'media type', body: '{"navigationMs":12}', status: 415, contentType: 'text/plain' },
  { name: '256 byte limit', body: ' '.repeat(257), status: 413 },
  { name: '256 bytes accepted', body: '{"navigationMs":12}'.padEnd(256), status: 204, metric: { input: { name: 'browser.navigation.duration', value: 12 }, options: { kind: 'histogram', unit: 'ms', attributes: { surface: 'site' } } } },
  { name: 'malformed data', body: '{', status: 400 },
  { name: 'extra key', body: '{"navigationMs":12,"url":"private"}', status: 400 },
  { name: 'navigation string', body: '{"navigationMs":"12"}', status: 400 },
  { name: 'error string', body: '{"errorKind":"1"}', status: 400 },
  { name: 'zero duration', body: '{"navigationMs":0}', status: 400 },
  { name: 'negative duration', body: '{"navigationMs":-1}', status: 400 },
  { name: 'large duration', body: '{"navigationMs":600001}', status: 400 },
  { name: 'non finite duration', body: '{"navigationMs":1e999}', status: 400 },
  { name: 'error lower bound', body: '{"errorKind":0}', status: 400 },
  { name: 'error upper bound', body: '{"errorKind":3}', status: 400 },
]) {
  test(`site diagnostics: ${scenario.name}`, async t => {
    const f = consentFixture({ t });
    const saved = await f.service.saveDraft({ principalId: 'owner', config: { ...f.config, enabled: !scenario.anonymous }, expectedDraftId: null });
    await f.service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null });
    const repo = new InMemorySettingsRepo(), now = '2026-11-20T00:00:00Z';
    await repo.saveDefinition({ settingId: 'metrics', version: 1, workspaceId: null, ...TELEMETRY_CONSENT, ownerKind: 'core', ownerId: null,
      schema: { type: 'boolean' }, defaultValue: false, scopes: 2, secret: false, status: 'active', aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: now, updatedAt: now });
    if (!scenario.off) await repo.saveWorkspaceValue({ settingId: 'metrics', scope: 'workspace', workspaceId: 'ws', principalId: null,
      valueJson: true, state: 'set', defVersion: 1, seq: 1, updatedBy: 'owner', updatedAt: now, originPluginId: null });
    const metrics: { input: MetricInput; options?: MetricOptions }[] = [];
    const deps = { ...createRouteDeps(), workspaceId: 'ws', settingsRepo: repo, consentStore: f.store, siteConsentReady: Promise.resolve(), cookieConsent: { regionResolvers: async () => [] },
      observability: { ...createNoopObservabilityPort({}), supportsMetric: !scenario.noMetrics, metric: (input: MetricInput, options?: MetricOptions) => { metrics.push({ input, options }); } },
      browserAnalytics: () => { assert.fail('diagnostics skips vendor lookup'); } };
    const app = express();
    applyBrowserAnalyticsHttp({ app, deps });
    const cookie = scenario.withdrawn ? 'jini_choices=' + encodeURIComponent(JSON.stringify({ v: 1, p: '1:' + saved.revision.id, t: deps.clock.nowMs(), a: 'reject', c: { functional: false, analytics: false, marketing: false } })) : 'jini_region=us';
    const send = () => dispatchHttpRequest({ app, method: scenario.method ?? 'POST', url: '/_jini/browser-analytics/site/diagnostics', body: Buffer.from(scenario.body),
      headers: { origin: scenario.origin ?? 'http://localhost', cookie, 'content-type': scenario.contentType ?? 'application/json' } });
    if (scenario.exhausted) { for (let i = 0; i < 140; i++) assert.equal((await send()).status, 204); metrics.length = 0; }
    assert.equal((await send()).status, scenario.status);
    assert.equal(metrics.length, scenario.status === 204 ? 1 : 0, 'every refusal records zero metrics');
    if (scenario.metric) assert.deepEqual(metrics, [scenario.metric]);
  });
}
