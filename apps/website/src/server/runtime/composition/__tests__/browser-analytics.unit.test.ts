import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express, Request, RequestHandler, Response } from 'express';
import { InMemorySettingsRepo } from '@jini-ai/core/settings';
import type { RouteDeps } from '#src/server/routes/types';
import { applyAdminBrowserAnalytics } from '../browser-analytics.js';
import { TELEMETRY_CONSENT } from '../telemetry-consent.js';

test('admin HTML injection follows the durable metrics setting and handles streamed HTML once', async () => {
  const repo = new InMemorySettingsRepo();
  const now = '2026-10-26T00:00:00Z';
  await repo.saveDefinition({ settingId: 'metrics', version: 1, workspaceId: null, ...TELEMETRY_CONSENT, ownerKind: 'core', ownerId: null,
    schema: { type: 'boolean' }, defaultValue: false, scopes: 2, secret: false, status: 'active', aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: now, updatedAt: now });
  let middleware!: RequestHandler;
  const app = { use(_paths: string[], handler: RequestHandler) { middleware = handler; } } as unknown as Express;
  const surfaces: string[] = [];
  applyAdminBrowserAnalytics({ app, deps: { workspaceId: 'workspace-1', settingsRepo: repo,
    browserAnalytics: ({ surface }) => { surfaces.push(surface); return [{ source: 'function(){return function(mode){};}', origins: [], supportsStatic: false }]; },
  } as RouteDeps });
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
