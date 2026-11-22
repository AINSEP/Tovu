/**
 * @file The plain decisions behind live site views (`use-live-views.hooks.ts`): the limit, the
 * recency order, which hidden tabs are offered for release, how a guest's answer is read, and the
 * scroll script a restored guest runs. `useLiveViews` itself, rendered under jsdom with real
 * guests, is covered by `app/SiteWorkspace.live-views.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_SITE_VIEWS } from '../contracts/site-view-preference.js';
import { liveViewLimit } from './use-site-view-preference.hooks.js';

test('the live limit is a positive whole number, and anything else is the default of 1', () => {
  assert.equal(LIVE_SITE_VIEWS.fallback, 1);
  assert.equal(liveViewLimit({ value: 5 }), 5);
  for (const value of [0, -1, 1.5, Number.NaN, '3', null, undefined]) assert.equal(liveViewLimit({ value }), 1, String(value));
});
