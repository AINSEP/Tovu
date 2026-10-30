import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createTracker } from '@jini-ai/diagnostics/observability/node';
import type { ProductEvent } from '@jini-ai/analytics/product';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import type { SiteSearchRuntime } from '#src/server/runtime/composition/modules/site-search';
import { parseSearchRequest, registerSiteSearchRoute } from '../../search.js';

for (const [count, elapsedMs, resultCountBucket, durationBucket] of [
  [0, 99, '0', '<100ms'], [1, 100, '1-10', '100ms-1s'],
  [10, 999, '1-10', '100ms-1s'], [11, 1000, '11-50', '>=1s'],
] as const) {
  test(`search telemetry buckets ${count} results at ${elapsedMs}ms without query terms`, { timeout: 1000 }, async () => {
    const events: ProductEvent[] = [];
    let delivered!: () => void;
    const delivery = new Promise<void>(resolve => { delivered = resolve; });
    let time = 5000;
    const hit = { key: { collection: 'post' }, url: '/hello', title: 'Hello', snippet: 'Result', highlights: [] };
    const runtime = {
      siteId: 'site', workspaceId: 'ws', ready: Promise.resolve(), audiencesForSession: async () => [],
      service: { query: async () => { time += elapsedMs; return { status: 'ok', page: { hits: Array.from({ length: count }, () => hit) } }; } },
    } as unknown as SiteSearchRuntime;
    const app = express();
    registerSiteSearchRoute(app, { siteSearch: runtime, clock: { nowMs: () => time }, idGen: { newId: () => 'anonymous' },
      tracker: createTracker({ productAnalytics: { capture(event) { events.push(event); delivered(); }, identify() {} } }),
      visitorAnalyticsProof: async () => ({ receiptId: 'private-receipt', policyVersion: '1' }),
      visitorAnalyticsDeliveryAllowed: async () => true,
    });
    const { res, capture } = createCapturingResponse();
    res.set = (() => res) as typeof res.set;
    await extractRouteHandler(app, 'get', '/api/search')({ query: { q: 'private search terms' }, headers: {} }, res);
    await delivery;
    assert.equal(capture.statusCode, 200);
    assert.deepEqual(events, [{ name: 'site_search_performed', userId: 'visitor:anonymous', properties: { resultCountBucket, durationBucket } }]);
    assert.deepEqual(capture.jsonBody, { hits: Array.from({ length: count }, () => ({ url: '/hello', title: 'Hello', snippet: 'Result', highlights: [], collection: 'post' })), nextCursor: null });
  });
}

for (const field of ['collection', 'limit', 'cursor'] as const) {
  test(`search rejects repeated ${field} independently`, () => {
    assert.deepEqual(parseSearchRequest({ query: { q: 'valid', [field]: ['first', 'second'] } }), { error: `'${field}' must be given once` });
  });
}

test('search accepts boundary limits, a full cursor and ten valid collections', () => {
  const collections = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  for (const limit of ['1', '50']) {
    assert.deepEqual(parseSearchRequest({ query: { q: ' q ', collection: collections.join(','), cursor: 'c'.repeat(1024), limit } }), {
      query: { text: 'q', collections, cursor: 'c'.repeat(1024), limit: Number(limit) },
    });
  }
});
