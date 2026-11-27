import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { InMemorySettingsRepo } from '@jini-ai/core/settings';
import type { RouteDeps } from '#src/server/routes/types';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { applyAdminBrowserAnalytics } from '../browser-analytics.js';
import { TELEMETRY_CONSENT } from '../telemetry-consent.js';

test('admin HTML injection follows the durable metrics setting and handles streamed HTML once', async () => {
  const repo = new InMemorySettingsRepo();
  const now = '2026-10-26T00:00:00Z';
  await repo.saveDefinition({ settingId: 'metrics', version: 1, workspaceId: null, ...TELEMETRY_CONSENT, ownerKind: 'core', ownerId: null,
    schema: { type: 'boolean' }, defaultValue: false, scopes: 2, secret: false, status: 'active', aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: now, updatedAt: now });
  let middleware!: RequestHandler;
  const app = { get() {}, use(_paths: string[], handler: RequestHandler) { middleware = handler; } } as unknown as Express;
  const surfaces: string[] = [];
  applyAdminBrowserAnalytics({ app, deps: { ...createRouteDeps(), workspaceId: 'workspace-1', settingsRepo: repo,
    browserAnalytics: ({ surface }) => { surfaces.push(surface); return [{ source: 'function(){return function(mode){};}', origins: [], supportsStatic: false }]; },
  } });
  async function render() {
    const headers = new Map<string, unknown>([['content-type', 'text/html'], ['etag', 'old'], ['content-length', '42']]);
    let finish!: (body: string) => void;
    const body = new Promise<string>(resolve => { finish = resolve; });
    const response = { statusCode: 200, destroyed: false,
      getHeader: (key: string) => headers.get(key.toLowerCase()), setHeader: (key: string, value: unknown) => headers.set(key.toLowerCase(), value),
      removeHeader: (key: string) => headers.delete(key.toLowerCase()),
      write() { return true; }, writeHead() {}, flushHeaders() {},
      end(chunk: Buffer) { finish(chunk.toString('utf8')); },
    } as unknown as Response;
    middleware({} as Request, response, () => {});
    response.write('<html><body>admin'); response.end('</body></html>');
    return { html: await body, headers };
  }
  const denied = await render();
  assert.ok(denied.html.includes('"hasChoice":false,"analytics":false'));
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  assert.equal(denied.headers.has('etag'), false);
  await repo.saveWorkspaceValue({ settingId: 'metrics', scope: 'workspace', workspaceId: 'workspace-1', principalId: null,
    valueJson: true, state: 'set', defVersion: 1, seq: 1, updatedBy: 'owner', updatedAt: now, originPluginId: null });
  const granted = await render();
  assert.ok(granted.html.includes('"hasChoice":true,"analytics":true'));
  assert.equal(granted.html.split('data-jini-browser-analytics').length, 2);
  assert.ok(granted.html.indexOf('data-jini-browser-analytics') < granted.html.indexOf('</body>'));
  assert.deepEqual(surfaces, ['admin', 'admin']);
});

test('live configuration check exposes only current opaque revisions, including provider removal', () => {
  let handler!: RequestHandler;
  let attached = true;
  const app = { get(_path: string, next: RequestHandler) { handler = next; }, use() {} } as unknown as Express;
  const contribution = { source: 'private browser configuration', origins: [], supportsStatic: false,
    configuration: { url: '/_jini/browser-analytics?surface=site', revision: 'opaque-current' } };
  applyAdminBrowserAnalytics({ app, deps: { browserAnalytics: () => attached ? [contribution] : [] } as unknown as RouteDeps });
  let body: unknown;
  const headers = new Map();
  const res = { setHeader: (key: string, value: string) => headers.set(key, value), json: (value: unknown) => { body = value; } } as unknown as Response;
  handler({ query: { surface: 'site' } } as unknown as Request, res, () => {});
  assert.deepEqual(body, ['opaque-current']);
  assert.equal(headers.get('Cache-Control'), 'no-store');
  attached = false;
  handler({ query: { surface: 'site' } } as unknown as Request, res, () => {});
  assert.deepEqual(body, []);
});

test('configuration requests select the admin surface and tolerate missing configuration', async () => {
  const deps = createRouteDeps();
  const app = express();
  applyAdminBrowserAnalytics({ app, deps });
  const url = '/_jini/browser-analytics?surface=admin';
  const absent = await dispatchHttpRequest({ app, method: 'GET', url });
  assert.equal(absent.status, 200);
  assert.equal(absent.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(absent.body), []);

  deps.browserAnalytics = ({ surface }) => [
    { source: 'never send this asset source', origins: [], supportsStatic: false },
    { source: 'never send this other source', origins: [], supportsStatic: false,
      configuration: { url, revision: surface === 'admin' ? 'admin-rev-38' : 'site-rev-11' } },
  ];
  const admin = await dispatchHttpRequest({ app, method: 'GET', url });
  assert.equal(admin.status, 200);
  assert.deepEqual(JSON.parse(admin.body), ['admin-rev-38']);
  const defaultSurface = await dispatchHttpRequest({ app, method: 'GET', url: '/_jini/browser-analytics' });
  assert.equal(defaultSurface.status, 200);
  assert.deepEqual(JSON.parse(defaultSurface.body), ['site-rev-11']);
});

test('error and already compressed admin pages are served without analytics or rewritten cache headers', async t => {
  const deps = createRouteDeps();
  const app = express();
  const calls: string[] = [];
  deps.browserAnalytics = ({ surface }) => {
    calls.push(surface);
    return [{ source: 'function(){return function(){};}', origins: [], supportsStatic: false }];
  };
  applyAdminBrowserAnalytics({ app, deps });
  const html = '<html><body>admin status</body></html>';
  app.get('/admin/status-page', (req, res) => {
    res.type('html').set('Cache-Control', 'no-cache');
    if (req.query.variant === 'compressed') {
      res.set('Content-Encoding', 'gzip').end(gzipSync(html));
      return;
    }
    res.status(503).end(html);
  });
  const baseUrl = await startTestServer(app, t);
  for (const [variant, status, encoding] of [['error', 503, null], ['compressed', 200, 'gzip']] as const) {
    const response = await fetch(`${baseUrl}/admin/status-page?variant=${variant}`);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.headers.get('content-encoding'), encoding);
    assert.equal(await response.text(), html);
  }
  assert.deepEqual(calls, []);
});
