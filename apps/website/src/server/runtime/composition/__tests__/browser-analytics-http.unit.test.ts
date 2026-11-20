/** Browser collector admission uses the published consent owner, never retired receipt cookies. */
import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { InMemorySettingsRepo } from '@jini-ai/core/settings';
import { createNoopObservabilityPort, type MetricInput, type MetricOptions } from '@jini-ai/core/contracts/observability';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
import { TELEMETRY_CONSENT } from '../telemetry-consent.js';
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
