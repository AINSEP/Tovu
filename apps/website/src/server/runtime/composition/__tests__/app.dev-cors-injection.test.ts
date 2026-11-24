import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Express } from 'express';
import { createApp, createRouteDeps } from '../app.js';

/**
 * @file The dev-CORS policy is a composition input, not a hard import of `createApp`'s public middleware:
 * a host (or a test) hands in its own policy and the real one stays the default.
 */

test('createApp installs the injected dev-CORS policy on its own express app, once, before routes', async () => {
  const seen: Express[] = [];
  const work: Promise<void>[] = [];
  const app = createApp(createRouteDeps(), { applyDevCors: (injected) => { seen.push(injected); }, onBootWork: ({ work: pending }) => { work.push(pending); } });
  await Promise.all(work);

  assert.equal(seen.length, 1);
  assert.equal(seen[0], app);
});
