import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Server } from 'node:http';
import express from 'express';
import { requestLoopbackHttp } from '@jini-ai/platform/net';
import { registerWarmSiteControl, warmSiteListing } from '../warm-site-control.js';

test('Sites in a warm tab shows that tab’s serving site while keeping the original host’s pool', () => {
  const binding = { name: 'child', dir: '/sites/child', dirOverridden: false, switcherCompatible: true };
  const localSites = [{ name: 'child', status: 'running', adminUrl: 'http://localhost:3101/admin/' }];
  const result = warmSiteListing({ binding, snapshot: { currentSite: { name: 'host' }, localSites,
    sites: [{ name: 'host', active: true }, { name: 'child', active: false }] } });
  assert.deepEqual(result.currentSite, { ...binding, listed: true });
  assert.deepEqual(result.sites.map(site => site.active), [false, true]);
  assert.equal((result as Record<string, unknown>).localSites, localSites);
});

test('a warm tab cannot hand over an address it does not own', () => {
  const binding = { name: 'child', dir: '/sites/child', dirOverridden: false, switcherCompatible: true };
  const result = warmSiteListing({ binding, snapshot: { currentSite: { name: 'host' }, sites: [],
    stopServing: { available: true, target: 'child', chatRunning: false } } });
  assert.deepEqual((result as Record<string, unknown>).stopServing, { available: false, target: null, chatRunning: false });
});

test('a warm tab delegates site management with the original cookies and preserves preview bytes', async t => {
  const seen: Array<{ url: string | undefined; cookie: string | undefined }> = [];
  const preview = Buffer.from([0, 255, 1, 0]);
  const parent = createServer((req, res) => {
    seen.push({ url: req.url, cookie: req.headers.cookie });
    if (req.url?.endsWith('/preview')) { res.setHeader('content-type', 'image/png'); res.end(preview); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ sites: [{ name: 'child' }], currentSite: { name: 'host' } }));
  });
  const address = async (server: Server) => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    return `http://localhost:${(server.address() as { port: number }).port}`;
  };
  const parentUrl = await address(parent);
  const app = express();
  registerWarmSiteControl({ app, workspaceId: 'child-ws', binding: {
    name: 'child', dir: '/sites/child', dirOverridden: false, switcherCompatible: true,
  } }, { env: { TOVU_DEV_WARM_SITES: '1', TOVU_DEV_WARM_CONTROL_URL: parentUrl,
    TOVU_DEV_WARM_CONTROL_WORKSPACE: 'host-ws', TOVU_DISABLE_DEV_TLS: '1' } });
  app.get('/identity', (_req, res) => res.json({ site: 'child' }));
  const childUrl = await address(createServer(app));
  const cookie = 'tovu_session_local_3000=host; tovu_session_local_3101=child';
  const prefix = `${childUrl}/api/admin/v1/workspaces/child-ws/system/sites`;
  const listing = await requestLoopbackHttp({ url: `${prefix}?fresh=1`, method: 'GET', headers: { cookie } });
  assert.equal(JSON.parse(listing.body.toString()).currentSite.name, 'child');
  assert.deepEqual(seen[0], { url: '/api/admin/v1/workspaces/host-ws/system/sites?fresh=1', cookie });
  const image = await requestLoopbackHttp({ url: `${prefix}/child/preview`, method: 'GET', headers: { cookie } });
  assert.deepEqual(image.body, preview);
  const identity = await requestLoopbackHttp({ url: `${childUrl}/identity`, method: 'GET' });
  assert.deepEqual(JSON.parse(identity.body.toString()), { site: 'child' });
});
