import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { RouteDeps } from '#src/server/routes/types';
import { registerCommerceHttp } from '../commerce-http.js';

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
