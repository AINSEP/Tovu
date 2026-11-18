import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { openFetchFrontendStream } from '@jini-ai/chat/browser/frontend-session-bridge';
import { createVisitorFrontendControl } from '../visitor-frontend-control.js';
import { allowsVisitorRequestOrigin } from '../visitor-request-origin.js';
import { publishVisitorPage } from '#src/features/theme/visitor-publication';
import { requestHookInput } from '#src/server/inbound/shared/request-facts';
import { daemonRouteHost, mountJiniRoutes, nodeSessionTimer } from '@tovu/host-shared/jini-routes';
import { PUBLIC_JSON_BODY_LIMIT_BYTES } from '#src/server/inbound/shared/json-body-parsers';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerSiteAssistantConfirm, SITE_ASSISTANT_CONFIRM_PATH } from '#src/server/inbound/public-http/routes/site-assistant-confirm';

/** What the composition root lends the visitor control: the real mount, host and timer, so these tests go through the same path the site uses. */
const TEST_PORTS = { mountRoutes: mountJiniRoutes, routeHost: daemonRouteHost, parserLimitBytes: PUBLIC_JSON_BODY_LIMIT_BYTES, setTimer: nodeSessionTimer };

/** Exercise the mounted routes and native HTTP objects without a listening socket. */
function policyFixture() {
  const app = express();
  const frontend = createVisitorFrontendControl({ workspaceId: 'origin-policy-test', enabled: async () => true,
    ports: TEST_PORTS, clock: { nowMs: () => 0 }, reportError: ({ error }) => { throw error; },
    canonicalOrigin: async () => ({ scheme: 'https', host: 'public.test', source: 'workspace-setting', verifiedAt: '2026-10-31' }),
  });
  frontend.mount({ app });
  let deliveries = 0;
  registerSiteAssistantConfirm({ app, ports: {
    confirmations: { request: async () => false, confirm: async () => { deliveries++; return true; } },
    enabled: async () => true, allowsOrigin: async ({ origin }) => origin === 'https://public.test',
    limiter: { check: async () => ({ allowed: true }) }, reportError: ({ error }) => { throw error; },
  } });
  app.use('/origin-policy', async (req, res) => {
    const allowed = await allowsVisitorRequestOrigin({ ...requestHookInput({ req }),
      allowsOrigin: async ({ origin }) => origin === 'https://public.test' });
    res.sendStatus(allowed ? 200 : 403);
  });
  return { app, frontend, deliveries: () => deliveries };
}

for (const fetchSite of ['cross-site', 'same-site', 'none', '']) {
  test(`credentials refuse Sec-Fetch-Site=${JSON.stringify(fetchSite)} even with a valid Origin`, async () => {
    const { app } = policyFixture();
    const response = await dispatchHttpRequest({ app, method: 'POST', url: '/api/site-assistant/frontend-sessions/credentials',
      headers: { host: 'preview.site.test', 'x-forwarded-proto': 'https', origin: 'https://preview.site.test', 'sec-fetch-site': fetchSite } });
    assert.equal(response.status, 403);
    assert.equal(response.headers['set-cookie'], undefined);
  });
}

test('F3b class guard: confirm and frontend credentials apply identical visitor origin verdicts', async t => {
  const origins = [
    { name: 'canonical', origin: 'https://public.test', serving: 'https://preview.site.test', allowed: true },
    ...['https://preview.site.test', 'http://localhost:5174', 'http://127.0.0.1:4100'].map(serving =>
      ({ name: `serving host ${serving}`, origin: serving, serving, allowed: true })),
    { name: 'host case', origin: 'https://preview.site.test', serving: 'https://Preview.Site.Test', allowed: true },
    { name: 'explicit HTTPS default port', origin: 'https://preview.site.test', serving: 'https://Preview.Site.Test:443', allowed: true },
    { name: 'explicit HTTP default port', origin: 'http://preview.site.test', serving: 'http://Preview.Site.Test:80', allowed: true },
    { name: 'matching nondefault port', origin: 'https://preview.site.test:8443', serving: 'https://Preview.Site.Test:8443', allowed: true },
    { name: 'missing nondefault serving port', origin: 'https://preview.site.test', serving: 'https://Preview.Site.Test:8443', allowed: false },
    { name: 'foreign', origin: 'https://foreign.test', serving: 'https://preview.site.test', allowed: false },
    { name: 'wrong port', origin: 'https://preview.site.test:8443', serving: 'https://preview.site.test', allowed: false },
    { name: 'wrong scheme', origin: 'http://preview.site.test', serving: 'https://preview.site.test', allowed: false },
    { name: 'missing Origin with matching Referer', origin: undefined, serving: 'https://preview.site.test', allowed: false },
    { name: 'empty Origin', origin: '', serving: 'https://preview.site.test', allowed: false },
    { name: 'opaque Origin', origin: 'null', serving: 'https://preview.site.test', allowed: false },
    { name: 'malformed Origin', origin: 'not a URL', serving: 'https://preview.site.test', allowed: false },
    { name: 'userinfo', origin: 'https://user@preview.site.test', serving: 'https://preview.site.test', allowed: false },
  ];
  for (const row of origins) for (const fetchSite of ['same-origin', 'cross-site', 'same-site', 'none', '', undefined]) {
    await t.test(`${row.name}; metadata=${JSON.stringify(fetchSite)}`, async () => {
      const f = policyFixture();
      const serving = new URL(row.serving);
      const body = { challengeId: 'a'.repeat(22), allow: true };
      // Preserve the wire Host: URL.host would erase case/default ports before the policy sees them.
      const headers = { host: row.serving.split('://')[1]!, 'x-forwarded-proto': serving.protocol.slice(0, -1),
        referer: `${row.serving}/page`, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(JSON.stringify(body))),
        ...(row.origin === undefined ? {} : { origin: row.origin }),
        ...(fetchSite === undefined ? {} : { 'sec-fetch-site': fetchSite }),
      };
      const confirm = await dispatchHttpRequest({ app: f.app, method: 'POST', url: SITE_ASSISTANT_CONFIRM_PATH,
        headers, body });
      const frontend = await dispatchHttpRequest({ app: f.app, method: 'POST', url: '/api/site-assistant/frontend-sessions/credentials', headers });
      const allowed = row.allowed && (fetchSite === undefined || fetchSite === 'same-origin');
      assert.equal(confirm.status, allowed ? 200 : 400, 'confirm verdict');
      assert.equal(frontend.status, allowed ? 200 : 403, 'frontend verdict');
      assert.equal(confirm.status === 200, frontend.status === 200, 'routes agree');
      assert.equal(f.deliveries(), allowed ? 1 : 0, 'refused clicks never consume a challenge');
      assert.equal(frontend.headers['set-cookie'] !== undefined, allowed, 'only allowed requests mint credentials');
    });
  }
  // Only safe reads may use Referer; a present Origin always takes precedence.
  const readOrigins: { name: string; headers: Record<string, string>; allowed: boolean }[] = [
    { name: 'serving Referer only', headers: { referer: 'https://preview.site.test/page' }, allowed: true },
    { name: 'serving Referer with normalized Host', headers: { host: 'Preview.Site.Test:443', referer: 'https://preview.site.test/page' }, allowed: true },
    { name: 'canonical Referer only', headers: { referer: 'https://public.test/page' }, allowed: true },
    { name: 'foreign Referer only', headers: { referer: 'https://foreign.test/page' }, allowed: false },
    { name: 'neither Origin nor Referer', headers: {}, allowed: false },
    { name: 'matching Origin beats foreign Referer', headers: { origin: 'https://preview.site.test', referer: 'https://foreign.test/page' }, allowed: true },
    { name: 'foreign Origin beats matching Referer', headers: { origin: 'https://foreign.test', referer: 'https://preview.site.test/page' }, allowed: false },
    { name: 'empty Origin blocks Referer fallback', headers: { origin: '', referer: 'https://preview.site.test/page' }, allowed: false },
    { name: 'malformed Referer', headers: { referer: 'not a URL' }, allowed: false },
  ];
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    for (const row of readOrigins) for (const fetchSite of ['same-origin', 'cross-site', 'same-site', 'none', '', undefined]) {
      await t.test(`${method} ${row.name}; metadata=${JSON.stringify(fetchSite)}`, async () => {
        const { app } = policyFixture();
        const headers: Record<string, string> = { host: 'preview.site.test', 'x-forwarded-proto': 'https', ...row.headers,
          ...(fetchSite === undefined ? {} : { 'sec-fetch-site': fetchSite }) };
        const response = await dispatchHttpRequest({ app, method, url: '/origin-policy', headers });
        const allowed = row.allowed && (row.headers.origin !== undefined || method === 'GET' || method === 'HEAD')
          && (fetchSite === undefined || fetchSite === 'same-origin');
        assert.equal(response.status, allowed ? 200 : 403);
      });
    }
  }
});

test('F3c real site-chat GET stream shape resolves its visitor owner without Origin', async () => {
  const { app, frontend } = policyFixture();
  const browserHeaders = { host: 'preview.site.test', 'x-forwarded-proto': 'https',
    referer: 'https://preview.site.test/page', 'sec-fetch-site': 'same-origin' };
  const issued = await dispatchHttpRequest({ app, method: 'POST', url: '/api/site-assistant/frontend-sessions/credentials',
    headers: { ...browserHeaders, origin: 'https://preview.site.test' } });
  assert.equal(issued.status, 200);
  const cookie = String(issued.headers['set-cookie']).split(';')[0]!;
  assert.match(cookie, /^tovu_visitor_frontend=/);
  const html = publishVisitorPage({ workspaceId: 'origin-policy-test', html: '<html><body><div id="tovu-site-assistant-root"></div></body></html>' });
  const revision = JSON.parse(html.match(/id="tovu-visitor-publication">(.*?)<\/script>/s)![1]!).revision as string;
  const { tabCredential } = JSON.parse(issued.body) as { tabCredential: string };
  const probe = express();
  // Use the stream's real owner boundary without opening an SSE connection or listening socket.
  probe.get('/api/site-assistant/frontend-sessions/stream', async (req, res) => {
    res.sendStatus(await frontend.resolveOwner(requestHookInput({ req })) ? 200 : 403);
  });
  let finish!: (status: number) => void;
  let fail!: (error: unknown) => void;
  const verdict = new Promise<number>((resolve, reject) => { finish = resolve; fail = reject; });
  const stream = openFetchFrontendStream({ url: '/api/site-assistant/frontend-sessions/stream?capability=page.click',
    headers: () => ({ 'x-frontend-tab': tabCredential, 'x-visitor-publication': revision }) }, {
    fetch: async (url, init) => {
      try {
        const request = new Request(new URL(String(url), 'https://preview.site.test'), init);
        assert.equal(request.method, 'GET');
        assert.equal(request.mode, 'same-origin');
        assert.equal(request.credentials, 'same-origin');
        assert.equal(request.redirect, 'error');
        assert.equal(request.headers.has('origin'), false);
        assert.equal(request.headers.get('x-frontend-tab'), tabCredential);
        assert.equal(request.headers.get('x-visitor-publication'), revision);
        // The browser supplies Referer, Fetch Metadata and its HttpOnly cookie, not the transport.
        const target = new URL(request.url);
        const response = await dispatchHttpRequest({ app: probe, method: request.method,
          url: `${target.pathname}${target.search}`,
          headers: { ...Object.fromEntries(request.headers), ...browserHeaders, cookie } });
        finish(response.status);
      } catch (error) { fail(error); }
      return new Response(null, { status: 403 }); // Terminal response prevents reconnects in this probe.
    },
  });
  try { assert.equal(await verdict, 200); }
  finally { stream.close(); }
});

async function fixture(t: test.TestContext, { trust = 'loopback' }: { trust?: 'loopback' | 1 | null } = {}) {
  const controllers: AbortController[] = [];
  t.after(() => controllers.forEach(controller => controller.abort()));
  const app = express();
  // Simulate distinct clients behind an explicitly trusted loopback proxy in this test only (`null`: no trust setting at all).
  if (trust !== null) app.set('trust proxy', trust);
  const frontend = createVisitorFrontendControl({ workspaceId: 'quota-test', enabled: async () => true,
    ports: TEST_PORTS, clock: { nowMs: () => 0 }, reportError: ({ error }) => { throw error; },
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

/** Opens `count` streams, each from a fresh guest, with the forwarded-for text `spoof(i)`; answers the statuses in order. */
async function openAll(f: Awaited<ReturnType<typeof fixture>>, { count, spoof }: { count: number; spoof: (index: number) => string }) {
  const statuses: number[] = [];
  for (let index = 1; index <= count; index++) statuses.push((await f.open(spoof(index), await f.issue(spoof(index)))).status);
  return statuses;
}

// Pin A2: with no trust setting the key is the socket's own address, so a spoofed X-Forwarded-For cannot buy a new quota.
test('spoofed X-Forwarded-For pin: without a trust setting four different spoofed clients share one socket quota', async t => {
  const f = await fixture(t, { trust: null });
  assert.deepEqual(await openAll(f, { count: 4, spoof: index => `203.0.113.${index}` }), [200, 200, 200, 429]);
});

// Pin A3: with one trusted hop Express takes the rightmost address, so text the client put on the left is not the key.
test('rightmost hop pin: with one trusted proxy the rightmost forwarded address is the quota key, a spoofed left address is not', async t => {
  const f = await fixture(t, { trust: 1 });
  assert.deepEqual(await openAll(f, { count: 4, spoof: index => `198.51.100.${index}, 192.0.2.9` }), [200, 200, 200, 429]);
  // A different rightmost address is a different client.
  assert.equal((await f.open('198.51.100.9, 192.0.2.10', await f.issue('192.0.2.10'))).status, 200);
});

/** One credentials POST; returns the whole answer. `origin` is built from the serving protocol the request claims. */
async function issueRaw(f: Awaited<ReturnType<typeof fixture>>, { forwardedProto }: { forwardedProto?: string }) {
  const host = new URL(f.base).host;
  const response = await fetch(`${f.base}/api/site-assistant/frontend-sessions/credentials`, { method: 'POST',
    headers: { origin: `https://${host}`, ...(forwardedProto === undefined ? {} : { 'x-forwarded-proto': forwardedProto }) } });
  return { status: response.status, setCookie: response.headers.get('set-cookie'), cacheControl: response.headers.get('cache-control'), body: await response.text() };
}

// Pin A5: the cookie's bytes and its Secure flag follow req.secure, which is not the serving protocol the origin check uses.
for (const [name, trust, forwardedProto, secure] of [
  ['one trusted proxy + https', 1, 'https', true],
  ['no trust + https', null, 'https', false],
  ['one trusted proxy + HTTPS,http (the first hop is not exactly "https")', 1, 'HTTPS,http', false],
] as const) test(`Secure cookie pin: ${name}: Secure is ${secure}, attributes in order, body is the credential only`, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  const f = await fixture(t, { trust });
  const answer = await issueRaw(f, { forwardedProto });
  assert.equal(answer.status, 200);
  assert.match(answer.setCookie ?? '', new RegExp(`^tovu_visitor_frontend=[A-Za-z0-9_.%-]+; Max-Age=1800; Path=/api/site-assistant; Expires=Tue, 14 Nov 2023 22:43:20 GMT; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict$`));
  assert.equal(answer.cacheControl, 'no-store');
  assert.match(answer.body, /^\{"tabCredential":"[A-Za-z0-9_.-]+"\}$/);
});

// Pin A6: the Referrer spelling wins over Referer, and an absent Host is printed as the word "undefined" in the serving origin.
for (const [name, headers, allowed] of [
  ['Referrer is the serving origin, Referer is forged', { referrer: 'https://preview.site.test/page', referer: 'https://forged.invalid/page' }, true],
  ['Referer is the serving origin, Referrer is forged', { referer: 'https://preview.site.test/page', referrer: 'https://forged.invalid/page' }, false],
  ['Referer alone is the serving origin', { referer: 'https://preview.site.test/page' }, true],
] as const) test(`Referrer pin: GET without Origin, ${name}: ${allowed ? 'allowed' : 'refused'}`, async () => {
  const { app } = policyFixture();
  const response = await dispatchHttpRequest({ app, method: 'GET', url: '/origin-policy', headers: { host: 'preview.site.test', 'x-forwarded-proto': 'https', ...headers } });
  assert.equal(response.status, allowed ? 200 : 403);
});

test('Referrer pin: a request with no Host header and Origin "https://undefined" is allowed today (the absent Host prints as the word undefined)', async () => {
  const { app } = policyFixture();
  const response = await dispatchHttpRequest({ app, method: 'GET', url: '/origin-policy',
    headers: { host: undefined, 'x-forwarded-proto': 'https', origin: 'https://undefined' } as unknown as Record<string, string> });
  assert.equal(response.status, 200);
});

for (const [name, method, path] of [['credentials minting', 'POST', 'credentials'], ['the quota gate', 'GET', 'stream']] as const) {
  test(`a throwing policy during ${name} answers a plain 403 and hands the error to the visitor reporter`, async () => {
    const app = express();
    const reported: unknown[] = [];
    const frontend = createVisitorFrontendControl({ workspaceId: 'report-test', enabled: async () => { throw new Error('policy store down'); },
      ports: TEST_PORTS, clock: { nowMs: () => 0 }, reportError: ({ error }) => { reported.push(error); },
      canonicalOrigin: async () => ({ scheme: 'https', host: 'public.test', source: 'workspace-setting', verifiedAt: '2026-10-31' }) });
    frontend.mount({ app });
    const response = await dispatchHttpRequest({ app, method, url: `/api/site-assistant/frontend-sessions/${path}`, headers: { host: 'public.test', origin: 'https://public.test', 'x-forwarded-proto': 'https' } });
    assert.equal(response.status, 403);
    assert.equal(response.body, 'Forbidden');
    assert.equal(reported.length, 1);
    assert.match(String((reported[0] as Error).message), /policy store down/);
  });
}
