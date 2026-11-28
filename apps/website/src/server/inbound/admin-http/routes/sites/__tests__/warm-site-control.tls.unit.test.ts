import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import express from 'express';
import { requestLoopbackHttp } from '@jini-ai/platform/net';

/**
 * @file A warm child reaches its parent dev server over HTTPS when the checkout has the dev TLS pair:
 * it must trust the checkout's own localhost certificate for that hop. Only the checkout root is
 * redirected (to a temp checkout holding a freshly generated `.certs` pair); dev-tls resolution, the
 * route and the HTTPS request run unchanged.
 */
const checkout = mkdtempSync(path.join(tmpdir(), 'warm-site-tls-'));
mkdirSync(path.join(checkout, '.certs'));
const certPath = path.join(checkout, '.certs/localhost.pem');
const keyPath = path.join(checkout, '.certs/localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1',
  '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', keyPath, '-out', certPath], { stdio: 'ignore' });
const productRoot = await import('#src/platform/site-dir/product-root');
mock.module('#src/platform/site-dir/product-root', { namedExports: { ...productRoot, resolveCheckoutRoot: () => checkout } });
const { registerWarmSiteControl } = await import('../warm-site-control.js');

test('with the dev TLS pair present, the warm child relays to an HTTPS parent that serves the checkout certificate', async t => {
  t.after(() => rmSync(checkout, { recursive: true, force: true }));
  const seen: Array<string | undefined> = [];
  const parent = createHttpsServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, (req, res) => {
    seen.push(req.url);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ sites: [{ name: 'child' }], currentSite: { name: 'host' } }));
  });
  const listen = async (server: Server) => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
    return (server.address() as { port: number }).port;
  };
  const parentPort = await listen(parent);
  const app = express();
  assert.equal(registerWarmSiteControl({ app, workspaceId: 'child-ws', binding: {
    name: 'child', dir: '/sites/child', dirOverridden: false, switcherCompatible: true,
  } }, { env: { TOVU_DEV_WARM_SITES: '1', TOVU_DEV_WARM_CONTROL_URL: `https://localhost:${parentPort}`, TOVU_DEV_WARM_CONTROL_WORKSPACE: 'host-ws' } }), true);
  const childPort = await listen(createHttpServer(app));
  const listing = await requestLoopbackHttp({ url: `http://localhost:${childPort}/api/admin/v1/workspaces/child-ws/system/sites`, method: 'GET', headers: {} });
  assert.equal(listing.status, 200);
  assert.equal(JSON.parse(listing.body.toString()).currentSite.name, 'child');
  assert.deepEqual(seen, ['/api/admin/v1/workspaces/host-ws/system/sites']);
});
