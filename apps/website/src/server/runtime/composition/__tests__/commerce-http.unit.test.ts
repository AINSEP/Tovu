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
