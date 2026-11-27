/**
 * @file The plain decisions behind live site views (`use-live-views.hooks.ts`): the limit, the
 * recency order, which hidden tabs are offered for release, how a guest's answer is read, and the
 * scroll script a restored guest runs. `useLiveViews` itself, rendered under jsdom with real
 * guests, is covered by `app/SiteWorkspace.live-views.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import { LIVE_SITE_VIEWS } from '../contracts/site-view-preference.js';
import { liveViewLimit } from '@jini-ai/ui/live-views';
import { renderHook, settle } from './dom-hook-harness.js';
import { RELEASE_PROBE, useLiveViews } from './use-live-views.hooks.js';

test('the live limit is a positive whole number, and anything else is the default of 1', () => {
  assert.equal(LIVE_SITE_VIEWS.fallback, 1);
  assert.equal(liveViewLimit({ value: 5, bounds: LIVE_SITE_VIEWS }), 5);
  for (const value of [0, -1, 1.5, Number.NaN, '3', null, undefined]) assert.equal(liveViewLimit({ value, bounds: LIVE_SITE_VIEWS }), 1, String(value));
});

test('the host\'s probe timeout keeps a nonresponsive guest and tries the next hidden tab', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const openIds = ['catalog', 'orders', 'home'];
  const probes: { id: string; code: string }[] = [];
  let focus = 'catalog';
  const getBridge = () => undefined;
  const tabs = renderHook({ t, useHook: () => useLiveViews({ openIds, focusedId: focus }, { getBridge, timeoutMs: 37 }) });
  act(() => tabs.current().registerGuest('catalog', { executeJavaScript: (code) => {
    probes.push({ id: 'catalog', code });
    return new Promise(() => {});
  } }));
  focus = 'orders';
  tabs.rerender();
  act(() => tabs.current().registerGuest('orders', { executeJavaScript: async (code) => {
    probes.push({ id: 'orders', code });
    return { release: true, url: 'http://localhost:4173/admin/orders', x: 0, y: 4, innerY: 83 };
  } }));
  focus = 'home';
  tabs.rerender();
  await settle();
  assert.deepEqual(probes.at(-1), { id: 'catalog', code: RELEASE_PROBE });
  t.mock.timers.tick(36);
  await settle();
  assert.equal(tabs.current().isLive({ id: 'orders' }), true);
  assert.equal(probes.some(({ id }) => id === 'orders'), false);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(probes.at(-1), { id: 'orders', code: RELEASE_PROBE });
  assert.equal(tabs.current().isLive({ id: 'catalog' }), true);
  assert.equal(tabs.current().isLive({ id: 'home' }), true);
  assert.equal(tabs.current().isLive({ id: 'orders' }), false);
  assert.deepEqual(tabs.current().parked, { orders: { url: 'http://localhost:4173/admin/orders', x: 0, y: 4, innerY: 83 } });
});
