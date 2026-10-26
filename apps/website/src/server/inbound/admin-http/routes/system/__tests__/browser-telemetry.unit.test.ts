import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express, Request, Response } from 'express';
import { createNoopObservabilityPort, type ObservabilityPort } from '#src/platform/observability/index';
import { withProductAnalyticsGuards, type ProductAnalyticsPort, type ProductEvent } from '@jini-ai/analytics/product';
type ErrorReport = Parameters<ObservabilityPort['reportError']>[0];
import type { RateLimiter } from '#src/contracts/core/rate-limit/rate-limit';
import {
  MAX_TELEMETRY_BODY_BYTES,
  parseBrowserTelemetry,
  registerAdminBrowserTelemetryRoute,
  scrubTelemetryText,
  toRouteTemplate,
} from '../browser-telemetry.js';

/** Fake ports: what reached the observability port and the analytics vendor. */
function fakePorts() {
  const errors: ErrorReport[] = [];
  const events: ProductEvent[] = [];
  const observability: ObservabilityPort = { ...createNoopObservabilityPort({}), reportError: (report) => { errors.push(report); } };
  const productAnalytics: ProductAnalyticsPort = { capture: (event) => { events.push(event); }, identify: () => {} };
  return { errors, events, observability, productAnalytics };
}

const allowAll: RateLimiter = { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) } as unknown as RateLimiter;

/** Runs only the route callback: no listener, no app. */
async function post(body: unknown, options: {
  warn?: (message: string) => void; deps?: Partial<ReturnType<typeof fakePorts>>; limiter?: RateLimiter; kind?: string; contentLength?: number; principalId?: string;
} = {}) {
  let handler!: (req: Request, res: Response) => Promise<void>;
  let path = '';
  const ports = { ...fakePorts(), ...options.deps };
  registerAdminBrowserTelemetryRoute({ post: (p: string, cb: typeof handler) => { path = p; handler = cb; } } as unknown as Express, {
    clock: { nowMs: () => 0, nowIso: () => new Date(0).toISOString() }, tracker: createTracker({ observability: ports.observability, productAnalytics: ports.productAnalytics }, { warn: options.warn }),
  }, options.limiter ?? allowAll);
  let status = 200, json: unknown;
  const headers: Record<string, string> = {};
  const res = {
    locals: { principal: { id: options.principalId ?? 'user-1' }, authCredentialKind: options.kind ?? 'session' },
    status(code: number) { status = code; return this; }, json(value: unknown) { json = value; return this; },
    end() { return this; }, setHeader(name: string, value: string) { headers[name] = value; },
  };
  const reqHeaders = options.contentLength === undefined ? {} : { 'content-length': String(options.contentLength) };
  await handler({ body, headers: reqHeaders } as unknown as Request, res as unknown as Response);
  return { path, status, json, headers, ...ports };
}

test('route templates drop queries/fragments and turn record ids into :id', () => {
  assert.equal(toRouteTemplate('/admin/posts/123?tab=seo#x'), '/admin/posts/:id');
  assert.equal(toRouteTemplate('/admin/pages/3f1c2a9e-1b2c-4d5e-8f90-1234567890ab/edit'), '/admin/pages/:id/edit');
  assert.equal(toRouteTemplate('/admin/media/a1b2c3d4e5f60718'), '/admin/media/:id');
  assert.equal(toRouteTemplate('/admin/posts/:postId'), '/admin/posts/:postId');
  assert.equal(toRouteTemplate('/admin/settings'), '/admin/settings');
  assert.equal(toRouteTemplate('/admin'), '/admin');
  assert.equal(toRouteTemplate('https://evil.example/admin'), null);
  assert.equal(toRouteTemplate('/api/admin/v1'), null);
  assert.equal(toRouteTemplate('/admin/<script>'), null);
});

test('free text loses URL queries and passes core secret/PII redaction', () => {
  const out = scrubTelemetryText('fetch https://x.test/a.js?token=abc123#frag failed for jane@example.com');
  assert.ok(out.includes('https://x.test/a.js'));
  assert.ok(!out.includes('token=abc123') && !out.includes('#frag'));
  assert.ok(!out.includes('jane@example.com'));
});

test('validation refuses unknown fields, wrong types, missing fields and non-admin routes', () => {
  assert.deepEqual(parseBrowserTelemetry({ type: 'pageview', route: '/admin', title: 'Secret post' }), { ok: false, status: 400, error: "unknown field 'title'" });
  assert.deepEqual(parseBrowserTelemetry({ type: 'error', message: 'x', route: '/admin' }), { ok: false, status: 400, error: "missing field 'stack'" });
  assert.deepEqual(parseBrowserTelemetry({ type: 'error', message: 1, stack: '', route: '/admin' }), { ok: false, status: 400, error: "'message' must be a string" });
  assert.deepEqual(parseBrowserTelemetry({ type: 'click', route: '/admin' }), { ok: false, status: 400, error: "type must be 'error' or 'pageview'" });
  assert.deepEqual(parseBrowserTelemetry({ type: 'pageview', route: '/wp-login' }), { ok: false, status: 400, error: 'route must be an admin path' });
  for (const body of [null, [], 'pageview']) assert.equal(parseBrowserTelemetry(body).ok, false);
});

test('oversize fields and oversize bodies are refused with 413', async () => {
  assert.deepEqual(parseBrowserTelemetry({ type: 'error', message: 'm'.repeat(1_001), stack: '', route: '/admin' }), { ok: false, status: 413, error: "'message' is too long" });
  assert.deepEqual(parseBrowserTelemetry({ type: 'pageview', route: `/admin/${'a'.repeat(200)}` }), { ok: false, status: 413, error: "'route' is too long" });
  const big = await post({ type: 'pageview', route: '/admin' }, { contentLength: MAX_TELEMETRY_BODY_BYTES + 1 });
  assert.equal(big.status, 413); assert.equal(big.events.length, 0);
});

test('a page view reaches product analytics as admin_pageview with only the route template', async () => {
  const out = await post({ type: 'pageview', route: '/admin/posts/42?q=draft' });
  assert.equal(out.path, '/api/admin/v1/telemetry');
  assert.equal(out.status, 204);
  assert.deepEqual(out.events, [{ name: 'admin_pageview', userId: 'user-1', properties: { route: '/admin/posts/:id' } }]);
  assert.equal(out.errors.length, 0);
});

test('an error reaches the observability port scrubbed, as the browser error, with route and component stack', async () => {
  const out = await post({
    type: 'error', message: 'boom for jane@example.com', stack: 'TypeError: boom\n    at https://h.test/assets/app.js?v=1:2:3',
    componentStack: '\n    at PostEditor\n    at App', route: '/admin/posts/42',
  });
  assert.equal(out.status, 204);
  assert.equal(out.errors.length, 1);
  const [{ error, context }] = out.errors as [ErrorReport];
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'AdminBrowserError');
  assert.ok(!error.message.includes('jane@example.com'));
  assert.equal(error.stack, 'TypeError: boom\n    at https://h.test/assets/app.js:2:3');
  assert.deepEqual(context, { operation: 'admin.browser.error', attributes: { source: 'admin-browser', route: '/admin/posts/:id', componentStack: '\n    at PostEditor\n    at App' } });
  assert.equal(out.events.length, 0);
});

test('an error without a stack still carries a stack line built from its own message', async () => {
  const out = await post({ type: 'error', message: 'rejected', stack: '', route: '/admin' });
  const [{ error, context }] = out.errors as [ErrorReport];
  assert.equal((error as Error).stack, 'AdminBrowserError: rejected');
  assert.deepEqual(context.attributes, { source: 'admin-browser', route: '/admin' });
});

test('consent off: page views never reach the vendor; consent on: they do', async () => {
  for (const consent of [false, true]) {
    const vendor = fakePorts();
    const guarded = withProductAnalyticsGuards({ inner: vendor.productAnalytics, consent: () => consent });
    const out = await post({ type: 'pageview', route: '/admin/settings' }, { deps: { productAnalytics: guarded } });
    assert.equal(out.status, 204);
    assert.equal(vendor.events.length, consent ? 1 : 0);
  }
});

test('no provider configured: the request still succeeds and nothing is sent', async () => {
  const out = await post({ type: 'pageview', route: '/admin' }, { deps: { productAnalytics: undefined } });
  assert.equal(out.status, 204);
});

test('machine credentials are refused before anything is read or forwarded', async () => {
  const out = await post({ type: 'pageview', route: '/admin' }, { kind: 'api_key' });
  assert.equal(out.status, 403); assert.equal(out.events.length, 0);
});

test('the per-principal limit answers 429 with Retry-After and forwards nothing', async () => {
  const keys: string[] = [];
  const limiter = { check: async ({ key }: { key: string }) => { keys.push(key); return { allowed: false, retryAfterSeconds: 7 }; } } as unknown as RateLimiter;
  const out = await post({ type: 'pageview', route: '/admin' }, { limiter, principalId: 'user-9' });
  assert.deepEqual([out.status, out.headers['Retry-After'], keys], [429, '7', ['user-9']]);
  assert.equal(out.events.length, 0);
});

test('a failing provider leaves the browser action successful and logs only a fixed warning', async () => {
  const logged: string[] = [];
  const observability = { ...createNoopObservabilityPort({}), reportError: () => { throw new Error('vendor detail'); } };
  const out = await post({ type: 'error', message: 'private', stack: '', route: '/admin' }, {
    deps: { observability }, warn: (message) => { logged.push(message); },
  });
  assert.equal(out.status, 204);
  assert.equal(out.json, undefined);
  assert.deepEqual(logged, ['[tracker] a telemetry provider failed; application work continues']);
});
