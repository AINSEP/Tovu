import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import type { ProductEvent } from '@jini-ai/analytics/product';
import { createTracker } from '@jini-ai/diagnostics/observability/node';
import { captureVisitorEvent, visitorAnalyticsProvenance, type VisitorAnalyticsDeps } from '../visitor-analytics.js';

test('public captures need an original grant and a still-active proof; receipt evidence never leaves', async () => {
  const events: ProductEvent[] = [];
  let granted = false, current = true;
  const proof = { receiptId: ['fake', 'receipt', '0123456789'].join('_'), policyVersion: '1' };
  const deps: VisitorAnalyticsDeps = { idGen: { newId: () => 'opaque-id' },
    tracker: createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } }),
    visitorAnalyticsProof: async () => granted ? proof : undefined,
    visitorAnalyticsDeliveryAllowed: async () => current,
  };
  const required = { deps, request: {} as Request, name: 'site_search_performed', properties: { resultCountBucket: '1-10' } };
  assert.equal(await visitorAnalyticsProvenance(required), undefined);
  await captureVisitorEvent(required); assert.deepEqual(events, []);
  granted = true; current = false;
  await captureVisitorEvent(required); assert.deepEqual(events, []);
  current = true; await captureVisitorEvent(required);
  assert.deepEqual(events, [{ name: 'site_search_performed', userId: 'visitor:opaque-id', properties: { resultCountBucket: '1-10' } }]);
  deps.visitorAnalyticsDeliveryAllowed = async () => { throw new Error('unavailable'); };
  await captureVisitorEvent(required); assert.equal(events.length, 1);
});
