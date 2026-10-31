import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createVisitorFrontendControl } from '../visitor-frontend-control.js';
import { publishVisitorPage } from '#src/features/theme/visitor-publication';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';

async function fixture(t: test.TestContext) {
  const controllers: AbortController[] = [];
  t.after(() => controllers.forEach(controller => controller.abort()));
  const app = express();
  // Simulate distinct clients behind an explicitly trusted loopback proxy in this test only.
  app.set('trust proxy', 'loopback');
  const frontend = createVisitorFrontendControl({ workspaceId: 'quota-test', enabled: async () => true,
    clock: { nowMs: () => 0, nowIso: () => '1970-01-01T00:00:00.000Z' },
    canonicalOrigin: async () => ({ scheme: 'https', host: 'public.test', source: 'workspace-setting', verifiedAt: '2026-10-31' }),
  });
  frontend.mount({ app });
  const base = await startTestServer(app, t);
  const html = publishVisitorPage({ workspaceId: 'quota-test', html: '<html><body><div id="tovu-site-assistant-root"></div></body></html>' });
  const revision = JSON.parse(html.match(/id="tovu-visitor-publication">(.*?)<\/script>/s)![1]!).revision;
  const headers = (ip: string) => ({ origin: base, 'x-forwarded-for': ip });
  const issue = async (ip: string) => {
    const response = await fetch(`${base}/api/site-assistant/frontend-sessions/credentials`, { method: 'POST', headers: headers(ip) });
    assert.equal(response.status, 200);
    const { tabCredential } = await response.json() as { tabCredential: string };
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, 'x-frontend-tab': tabCredential, 'x-visitor-publication': revision };
  };
  const open = async (ip: string, credentials: Awaited<ReturnType<typeof issue>>) => {
    const controller = new AbortController(); controllers.push(controller);
    return fetch(`${base}/api/site-assistant/frontend-sessions/stream?capability=page.click`, {
      headers: { ...headers(ip), ...credentials }, signal: controller.signal,
    });
  };
  return { base, headers, issue, open };
}

test('Origin/Host validation refuses forged same-origin metadata on credentials and streams', async t => {
  const f = await fixture(t);
  for (const path of ['credentials', 'stream']) {
    const response = await fetch(`${f.base}/api/site-assistant/frontend-sessions/${path}`, {
      method: path === 'credentials' ? 'POST' : 'GET',
      headers: { origin: 'https://forged.invalid', 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(response.status, 403);
  }
  const missing = await fetch(`${f.base}/api/site-assistant/frontend-sessions/credentials`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } });
  assert.equal(missing.status, 403);
});

test('new guest cookies cannot bypass the IP session cap or exhaust another client', async t => {
  const f = await fixture(t);
  for (let index = 0; index < 3; index++) assert.equal((await f.open('192.0.2.1', await f.issue('192.0.2.1'))).status, 200);
  assert.equal((await f.open('192.0.2.1', await f.issue('192.0.2.1'))).status, 429);
  assert.equal((await f.open('192.0.2.2', await f.issue('192.0.2.2'))).status, 200);
});

test('changing IP cannot bypass an authenticated guest session cap', async t => {
  const f = await fixture(t);
  const credentials = await f.issue('192.0.2.1');
  for (let index = 1; index <= 3; index++) assert.equal((await f.open(`192.0.2.${index}`, credentials)).status, 200);
  assert.equal((await f.open('192.0.2.4', credentials)).status, 429);
  assert.equal((await f.open('192.0.2.4', await f.issue('192.0.2.4'))).status, 200);
});

for (const path of ['credentials', 'stream']) test(`${path} is rate limited per IP before mint/attach`, async t => {
  const f = await fixture(t);
  const send = (ip: string) => fetch(`${f.base}/api/site-assistant/frontend-sessions/${path}`, {
    method: path === 'credentials' ? 'POST' : 'GET', headers: f.headers(ip),
  });
  for (let index = 0; index < 30; index++) assert.equal((await send('192.0.2.1')).status, path === 'credentials' ? 200 : 403);
  assert.equal((await send('192.0.2.1')).status, 429);
  assert.equal((await send('192.0.2.2')).status, path === 'credentials' ? 200 : 403);
});

test('credential minting is rate limited per authenticated guest across IPs', async t => {
  const f = await fixture(t);
  const credentials = await f.issue('192.0.2.1');
  const mint = (index: number) => fetch(`${f.base}/api/site-assistant/frontend-sessions/credentials`, {
    method: 'POST', headers: { ...f.headers(`198.51.100.${index}`), cookie: credentials.cookie },
  });
  for (let index = 1; index <= 30; index++) assert.equal((await mint(index)).status, 200);
  assert.equal((await mint(31)).status, 429);
});
