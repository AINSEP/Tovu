import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { RouteDeps } from '#src/server/routes/types';
import { dispatchHttpRequest } from '#src/server/__tests__/helpers/in-process-http';
import { portFake } from '#src/server/__tests__/helpers/port-fake';
import { UNAVAILABLE_ERROR_ID } from '@jini-ai/core/errors/reporter';
import { registerCommerceHttp } from '../commerce-http.js';

function storefrontGuard({ storefrontStatus }: { storefrontStatus: () => Promise<unknown> }) {
  let handler: ((req: unknown, res: unknown, next: () => void) => Promise<void>) | undefined;
  const app = { use: (route: typeof handler) => { handler = route; } } as unknown as express.Express;
  registerCommerceHttp({ app, deps: { workspaceId: 'workspace', clock: { nowMs: () => 0, nowIso: () => '2026-11-05T00:00:00.000Z' }, commerce: { storefrontStatus } } as unknown as RouteDeps });
  assert.ok(handler, 'the storefront guard is registered');
  return handler;
}

// why: the storefront incident goes through the request's bound failure reporter (admin-failure.ts);
// redaction of the diagnostic is that reporter's job, so this pins what commerce-http owns: the exact
// error and operation it reports, and that the visitor sees only the reporter's reference.
test('storefront readiness failure reports through the bound reporter and returns only its incident reference', async () => {
  const thrown = new Error('boom tovu_ak_0123456789ab.SECRETSECRETSECRETSECRET');
  const handler = storefrontGuard({ storefrontStatus: async () => { throw thrown; } });
  const recorded: unknown[][] = [];
  const failureReporter = { record: (...args: unknown[]) => { recorded.push(args); return { errorId: 'ERR-AAAA-BBBB-CCCC-DDDD' }; } };
  let status = 0; let body = '';
  const res = { locals: { failureReporter }, status(code: number) { status = code; return res; }, type() { return res; }, send(value: string) { body = value; return res; } };
  await handler({ path: '/products' }, res, () => assert.fail('the failure must be answered'));
  assert.equal(status, 503);
  assert.equal(body, '<h1>The shop catalog is temporarily unavailable.</h1><p>Please try again shortly.</p><p>Reference: ERR-AAAA-BBBB-CCCC-DDDD</p>');
  assert.deepEqual(recorded, [[{ error: thrown, step: 'commerce:storefront', operation: 'commerce:storefront' }, {}]]);
});

test('storefront readiness failure with no bound reporter still answers 503 with the unavailable reference', async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  const handler = storefrontGuard({ storefrontStatus: async () => { throw new Error('boom'); } });
  let status = 0; let body = '';
  const res = { locals: {}, status(code: number) { status = code; return res; }, type() { return res; }, send(value: string) { body = value; return res; } };
  await handler({ path: '/products' }, res, () => assert.fail('the failure must be answered'));
  assert.equal(status, 503);
  assert.equal(body, `<h1>The shop catalog is temporarily unavailable.</h1><p>Please try again shortly.</p><p>Reference: ${UNAVAILABLE_ERROR_ID}</p>`);
  assert.deepEqual(logs, [['[admin-failure] reporter unavailable', { operation: 'commerce:storefront' }]]);
});

test('disabled commerce lets published product and commerce paths reach the CMS', async t => {
  const { createRouteDeps } = await import('#src/server/runtime/composition/app');
  const app = express();
  registerCommerceHttp({ app, deps: { ...createRouteDeps(), commerce: { storefrontStatus: async () => ({ active: false, ready: false, reason: null }), status: async () => ({ active: false, ready: false, reason: null }) } } as unknown as RouteDeps });
  app.get(['/products', '/products/example', '/commerce/return', '/commerce/cancel', '/commerce/checkout.js'], (_req, res) => res.send('Published CMS page'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  for (const path of ['/products', '/products/example', '/commerce/return', '/commerce/cancel', '/commerce/checkout.js']) {
    const response: Response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    assert.equal(response.status, 200); assert.equal(await response.text(), 'Published CMS page');
  }
});

test('an active shop with unavailable checkout answers product pages without reading or rendering the catalog', async () => {
  const app = express();
  const reads: string[] = [];
  const deps = portFake<RouteDeps>({
    workspaceId: 'shop', clock: { nowMs: () => 0, nowIso: () => '2026-11-05T00:00:00.000Z' },
    commerce: { storefrontStatus: async () => { reads.push('status'); return { active: true, ready: false, reason: 'configure payment' }; } },
    commerceCatalog: { listProducts: async () => { reads.push('list'); return []; }, findProduct: async () => { reads.push('find'); return null; } },
  });
  registerCommerceHttp({ app, deps });
  app.use((_req, res) => { res.status(418).send('CMS fallback'); });
  for (const url of ['/products', '/products/notebook']) {
    const reply = await dispatchHttpRequest({ app, method: 'GET', url });
    assert.equal(reply.status, 404);
    assert.match(String(reply.headers['content-type']), /^text\/html/);
    assert.equal(reply.body, '<h1>This shop is not accepting purchases.</h1>');
  }
  assert.deepEqual(reads, ['status', 'status']);
});

test('a product request shares readiness and configured origin through guard, point lookup and controls', async t => {
  const { createRouteDeps } = await import('#src/server/runtime/composition/app');
  let statusReads = 0, originReads = 0, listReads = 0, pointReads = 0;
  const status = { active: true, ready: true, reason: null, checkoutOrigin: 'https://shop.test' };
  const app = express();
  registerCommerceHttp({ app, deps: { ...createRouteDeps(), commerce: {
    storefrontStatus: async () => { statusReads++; return status; },
    status: async () => { throw new Error('admin status must not run for a storefront request'); },
    checkoutOrigin: async () => { originReads++; return 'https://shop.test'; },
  }, commerceCatalog: {
    listProducts: async () => { listReads++; return []; },
    findProduct: async ({ idOrSlug }: { idOrSlug: string }, optional: { readiness?: unknown }) => {
      pointReads++; assert.equal(idOrSlug, 'book'); assert.equal(optional.readiness, status);
      return { id: 'book', slug: 'book', title: 'Notebook', priceId: 'price', price: 1000, currency: 'USD' };
    },
  } } as unknown as RouteDeps });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const response: Response = await fetch(`http://127.0.0.1:${address.port}/products/book`);
  assert.equal(response.status, 200); assert.match(await response.text(), /Open shop to buy/);
  assert.equal(statusReads, 1); assert.equal(originReads, 0); assert.equal(pointReads, 1); assert.equal(listReads, 0);
});

test('signed-out payment return uses the active theme shell and remains private', async t => {
  const { createRouteDeps } = await import('#src/server/runtime/composition/app');
  const deps = createRouteDeps();
  const theme = deps.themes.find(item => item.manifest.id === 'fashion-modern');
  assert.ok(theme);
  const app = express();
  registerCommerceHttp({ app, deps: { ...deps, themes: [theme], commerce: {
    storefrontStatus: async () => ({ active: true, ready: true, reason: null }),
    status: async () => ({ active: true, ready: true, reason: null }),
  } } as unknown as RouteDeps });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const response: Response = await fetch(`http://127.0.0.1:${address.port}/commerce/return?orderId=order`);
  assert.equal(response.status, 401); assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.match(html, /data-theme="fashion-modern"/); assert.match(html, /Sign in/); assert.match(html, /href="\/products"/);
  assert.ok(theme.css.length > 0); assert.ok(html.includes(theme.css), 'the shell retains the active theme stylesheet');
});

test('order API routes remain mounted while storefront paths are disabled', async t => {
  const app = express();
  registerCommerceHttp({ app, deps: { workspaceId: 'workspace', clock: { nowMs: () => Date.parse('2026-11-05T00:00:00.000Z'), nowIso: () => '2026-11-05T00:00:00.000Z' }, commerce: {
    storefrontStatus: async () => ({ active: false, ready: false, reason: null }),
  } } as unknown as RouteDeps });
  app.use((_req, res) => res.send('CMS fallback'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.closeAllConnections(); server.close(() => resolve()); }));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const response: Response = await fetch(`http://127.0.0.1:${address.port}/api/commerce/v1/workspaces/workspace/orders/order`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Sign in as a shop member to view or pay for your order.', code: 'MEMBER_SIGN_IN_REQUIRED' });
});

test('the order API keeps the host proxy settings: each forwarded buyer has an own rate budget', async t => {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  registerCommerceHttp({ app, deps: { workspaceId: 'workspace', clock: { nowMs: () => Date.parse('2026-11-05T00:00:00.000Z'), nowIso: () => '2026-11-05T00:00:00.000Z' }, commerce: {
    storefrontStatus: async () => ({ active: false, ready: false, reason: null }),
  } } as unknown as RouteDeps });
  app.use((req, res) => res.json({ sameApp: req.app === app }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const order = (client: string) => fetch(`http://127.0.0.1:${address.port}/api/commerce/v1/workspaces/workspace/orders/order`, { headers: { 'X-Forwarded-For': client } });
  let status = 0;
  for (let request = 0; request < 200 && status !== 429; request += 1) status = (await order('203.0.113.1')).status;
  assert.equal(status, 429, 'the first buyer spends their own budget');
  assert.equal((await order('203.0.113.2')).status, 401, 'another buyer behind the same proxy is not limited');
  const passed = await fetch(`http://127.0.0.1:${address.port}/api/commerce/v1/unrouted`);
  assert.equal(passed.headers.get('x-powered-by'), null);
  assert.deepEqual(await passed.json(), { sameApp: true }, 'a fall-through continues on the host app');
});

test('a trailing slash reaches the same storefront and order routes as the plain path', async t => {
  const { createRouteDeps } = await import('#src/server/runtime/composition/app');
  const app = express();
  registerCommerceHttp({ app, deps: { ...createRouteDeps(), commerce: {
    storefrontStatus: async () => ({ active: true, ready: true, reason: null }),
    status: async () => ({ active: true, ready: true, reason: null }),
  } } as unknown as RouteDeps });
  app.use((_req, res) => res.status(418).send('CMS fallback'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const statusOf = async (method: string, path: string, query = '') => {
    const response: Response = await fetch(`http://127.0.0.1:${address.port}${path}${query}`, { method });
    await response.text();
    return response.status;
  };
  const orders = '/api/commerce/v1/workspaces/workspace/orders';
  for (const [method, path, query] of [
    ['GET', '/commerce/return', '?orderId=order'], ['GET', '/commerce/cancel', '?orderId=order'],
    ['GET', '/commerce/checkout.js', ''], ['GET', `${orders}/order`, ''],
    ['POST', orders, ''], ['POST', `${orders}/order/pay`, ''],
  ] as const) {
    const plain = await statusOf(method, path, query);
    assert.notEqual(plain, 418, `${method} ${path} must reach its route`);
    assert.equal(await statusOf(method, `${path}/`, query), plain, `${method} ${path}/`);
  }
});


test('case variants reach commerce handlers instead of a published CMS fallback', async t => {
  const { createRouteDeps } = await import('#src/server/runtime/composition/app');
  const app = express();
  registerCommerceHttp({ app, deps: { ...createRouteDeps(), commerce: {
    storefrontStatus: async () => ({ active: true, ready: true, reason: null }),
    status: async () => ({ active: true, ready: true, reason: null }),
  } } as unknown as RouteDeps });
  app.use((_req, res) => res.status(418).send('CMS fallback'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  for (const route of ['/commerce/return', '/commerce/cancel', '/commerce/checkout.js', '/products', '/api/commerce/v1/workspaces/workspace/orders/order']) {
    const plain: Response = await fetch(`http://127.0.0.1:${address.port}${route}`);
    await plain.text();
    assert.notEqual(plain.status, 418);
    for (const path of [route.toUpperCase(), `${route.toUpperCase()}/`]) {
      const variant: Response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      await variant.text();
      assert.equal(variant.status, plain.status, path);
    }
  }
});
