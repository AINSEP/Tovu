import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { RouteDeps } from '#src/server/routes/types';
import { registerCommerceHttp } from '../commerce-http.js';

test('disabled commerce lets published product paths reach the CMS', async t => {
  const app = express();
  registerCommerceHttp({ app, deps: { commerce: { status: async () => ({ active: false, ready: false, reason: null }) } } as unknown as RouteDeps });
  app.get(['/products', '/products/example'], (_req, res) => res.send('Published CMS page'));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  for (const path of ['/products', '/products/example']) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    assert.equal(response.status, 200); assert.equal(await response.text(), 'Published CMS page');
  }
});

test('a product request shares readiness and configured origin through guard, point lookup and controls', async t => {
  const { createRouteDeps } = await import('#src/server/runtime/composition/app');
  let statusReads = 0, originReads = 0, listReads = 0, pointReads = 0;
  const status = { active: true, ready: true, reason: null, checkoutOrigin: 'https://shop.test' };
  const app = express();
  registerCommerceHttp({ app, deps: { ...createRouteDeps(), commerce: {
    status: async () => { statusReads++; return status; },
    checkoutOrigin: async () => { originReads++; return 'https://shop.test'; },
  }, commerceCatalog: {
    listProducts: async () => { listReads++; return []; },
    findProduct: async ({ idOrSlug }: { idOrSlug: string }, optional: { readiness?: unknown }) => {
      pointReads++; assert.equal(idOrSlug, 'book'); assert.equal(optional.readiness, status);
      return { id: 'book', slug: 'book', title: 'Notebook', priceId: 'price', price: 1000, currency: 'USD' };
    },
  } } as unknown as RouteDeps });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/products/book`);
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
    status: async () => ({ active: true, ready: true, reason: null }),
  } } as unknown as RouteDeps });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/commerce/return?orderId=order`);
  assert.equal(response.status, 401); assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const html = await response.text();
  assert.match(html, /data-theme="fashion-modern"/); assert.match(html, /Sign in/); assert.match(html, /href="\/products"/);
  assert.ok(theme.css.length > 0); assert.ok(html.includes(theme.css), 'the shell retains the active theme stylesheet');
});
