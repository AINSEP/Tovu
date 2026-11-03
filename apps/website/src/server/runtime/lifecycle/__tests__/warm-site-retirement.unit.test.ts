import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { createWarmSiteRetirement, registerWarmSiteRetirement } from '../warm-site-retirement.js';

test('a completed sitemap regeneration returning 202 still permits automatic warm eviction', async t => {
  const app = express();
  registerWarmSiteRetirement({ app, siteDir: '/unused' }, {
    env: { TOVU_DEV_RETIRE_TOKEN: 'retire', TOVU_DEV_WARM_SITES: '1' },
    hasWork: async () => false,
  });
  app.post('/sitemap/regenerate', async (_req, res) => { await Promise.resolve(); res.status(202).json({ data: { accepted: true } }); });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/sitemap/regenerate`, { method: 'POST' })).status, 202);
  assert.equal((await fetch(`${base}/internal/dev-site-retire`, { method: 'POST', headers: { 'x-tovu-retire': 'retire' } })).status, 204);
});

test('warm LRU retirement fences new work before checking whether an assistant is running', async () => {
  let guard!: ReturnType<typeof createWarmSiteRetirement>;
  guard = createWarmSiteRetirement({ hasWork: async () => {
    assert.equal(guard.accepting(), false);
    return true;
  } });
  assert.equal(await guard.retire(), false);
  assert.equal(guard.accepting(), true, 'busy site resumes intake');
});

test('an active job or failed activity check prevents warm eviction until completion', async () => {
  let working = true;
  const guard = createWarmSiteRetirement({ hasWork: async () => working });
  const release = guard.begin();
  assert.equal(await guard.retire(), false);
  release({ background: true });
  assert.equal(await guard.retire(), false);
  working = false;
  assert.equal(await guard.retire(), true);
  const uncertain = createWarmSiteRetirement({ hasWork: async () => { throw new Error('unavailable'); } });
  assert.equal(await uncertain.retire(), false);
});

test('an idle warm site stays fenced until its process is stopped', async () => {
  const guard = createWarmSiteRetirement({ hasWork: async () => false });
  const release = guard.begin(); release({}); release({});
  assert.equal(await guard.retire(), true);
  assert.equal(guard.accepting(), false);
  guard.cancel();
  assert.equal(guard.accepting(), true, 'a canceled eviction must restore the live site');
});

test('an unreadable activity source cannot strand a warm site with intake fenced', async () => {
  const guard = createWarmSiteRetirement({ hasWork: () => new Promise<boolean>(() => {}) }, { activityTimeoutMs: 1 });
  assert.equal(await guard.retire(), false);
  assert.equal(guard.accepting(), true);
});
