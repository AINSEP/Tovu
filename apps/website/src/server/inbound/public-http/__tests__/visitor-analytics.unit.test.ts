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

test('public analytics has no legacy boolean-consent fallback or dependency on owner telemetry', async () => {
  const events: ProductEvent[] = [];
  const deps: VisitorAnalyticsDeps & { visitorAnalyticsConsent: () => Promise<boolean> } = {
    idGen: { newId: () => 'local' }, tracker: createTracker({}),
    visitorTracker: createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } }),
    visitorAnalyticsConsent: async () => true,
    visitorAnalyticsDeliveryAllowed: async () => true,
  };
  const required = { deps, request: {} as Request, name: 'site_search_performed', properties: { resultCountBucket: '0' } };
  await captureVisitorEvent(required); assert.deepEqual(events, []);
  deps.visitorAnalyticsProof = async () => ({ receiptId: 'private-local-receipt', policyVersion: '1' });
  await captureVisitorEvent(required);
  assert.deepEqual(events, [{ name: 'site_search_performed', userId: 'visitor:local', properties: { resultCountBucket: '0' } }]);
  assert.equal(JSON.stringify(events).includes('private-local-receipt'), false);
});
