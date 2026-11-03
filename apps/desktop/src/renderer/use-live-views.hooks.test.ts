/**
 * @file The plain decisions behind live site views (`use-live-views.hooks.ts`): the limit, the
 * recency order, which hidden tabs are offered for release, how a guest's answer is read, and the
 * scroll script a restored guest runs. `useLiveViews` itself, rendered under jsdom with real
 * guests, is covered by `app/SiteWorkspace.live-views.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_LIVE_VIEW_LIMIT,
  RELEASE_PROBE,
  liveViewLimit,
  liveViewOrder,
  parseReleaseProbe,
  probeRelease,
  releaseCandidates,
  releaseExcessViews,
  restoreParkedScroll,
  scrollScript,
  type LiveGuest,
  type ScrollGuest,
} from './use-live-views.hooks.js';

test('the live limit is a positive whole number, and anything else is the default of 1', () => {
  assert.equal(DEFAULT_LIVE_VIEW_LIMIT, 1);
  assert.equal(liveViewLimit({ value: 5 }), 5);
  for (const value of [0, -1, 1.5, Number.NaN, '3', null, undefined]) assert.equal(liveViewLimit({ value }), 1, String(value));
});

test('the focused tab leads the live order, closed tabs drop out, the rest keep their recency', () => {
  assert.deepEqual(liveViewOrder({ order: ['b', 'a', 'c'], focusedId: 'c', openIds: ['a', 'b', 'c'] }), ['c', 'b', 'a']);
  assert.deepEqual(liveViewOrder({ order: ['b', 'a'], focusedId: 'd', openIds: ['a', 'b', 'd'] }), ['d', 'b', 'a'], 'a newly focused tab joins at the front');
  assert.deepEqual(liveViewOrder({ order: ['b', 'a'], focusedId: null, openIds: ['a'] }), ['a'], 'outside Websites nothing is focused; b was closed');
  assert.deepEqual(liveViewOrder({ order: [], focusedId: 'gone', openIds: ['a'] }), [], 'a focus on a tab that is not open is no tab');
});

test('nothing is released at or under the limit; over it, hidden tabs are offered least recently focused first', () => {
  assert.deepEqual(releaseCandidates({ order: ['b', 'a'], focusedId: 'b', limit: 2 }), { candidates: [], excess: 0 });
  assert.deepEqual(releaseCandidates({ order: ['c', 'b', 'a'], focusedId: 'c', limit: 2 }), { candidates: ['a', 'b'], excess: 1 });
  assert.deepEqual(releaseCandidates({ order: ['c', 'b', 'a'], focusedId: null, limit: 1 }), { candidates: ['a', 'b', 'c'], excess: 2 }, 'with nothing on screen every tab is hidden');
});

test('only an explicit yes releases, and only a web url is kept as the route to restore', () => {
  for (const value of [null, undefined, 'yes', 1, {}, { release: 'true' }, { release: false, url: 'http://127.0.0.1:4100/' }]) {
    assert.deepEqual(parseReleaseProbe({ value }), { release: false, parked: null }, JSON.stringify(value));
  }
  assert.deepEqual(parseReleaseProbe({ value: { release: true, url: 'http://127.0.0.1:4100/admin/posts', x: 1, y: 2, innerY: 3 } }), {
    release: true, parked: { url: 'http://127.0.0.1:4100/admin/posts', x: 1, y: 2, innerY: 3 },
  });
  assert.deepEqual(parseReleaseProbe({ value: { release: true, url: 'http://127.0.0.1:4100/', y: 'far', innerY: Number.POSITIVE_INFINITY } }), {
    release: true, parked: { url: 'http://127.0.0.1:4100/', x: 0, y: 0, innerY: 0 },
  }, 'a scroll that is not a finite number restores to the top');
  for (const url of ['chrome-error://chromewebdata/', 'javascript:alert(1)', 'not a url', 42]) {
    assert.deepEqual(parseReleaseProbe({ value: { release: true, url } }), { release: true, parked: null }, String(url));
  }
});

const guestAnswering = (answer: () => Promise<unknown>) => ({ executeJavaScript: answer }) as unknown as LiveGuest;

test('a tab with no guest is released at once; a guest that throws, rejects or never answers is kept', async (t) => {
  assert.deepEqual(await probeRelease({ guest: null }), { release: true, parked: null });
  assert.deepEqual(await probeRelease({ guest: guestAnswering(() => { throw new Error('not attached'); }) }), { release: false, parked: null });
  assert.deepEqual(await probeRelease({ guest: guestAnswering(() => Promise.reject(new Error('gone'))) }), { release: false, parked: null });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = probeRelease({ guest: guestAnswering(() => new Promise(() => {})) }, { timeoutMs: 50 });
  t.mock.timers.tick(50);
  assert.deepEqual(await pending, { release: false, parked: null });
});

test('the probe is the release script, and its yes comes back with the route', async () => {
  const scripts: string[] = [];
  const guest = { executeJavaScript: async (code: string) => { scripts.push(code); return { release: true, url: 'http://127.0.0.1:4100/about' }; } } as unknown as LiveGuest;
  assert.deepEqual(await probeRelease({ guest }), { release: true, parked: { url: 'http://127.0.0.1:4100/about', x: 0, y: 0, innerY: 0 } });
  assert.deepEqual(scripts, [RELEASE_PROBE]);
});

test('releasing stops once enough agreed, and a veto moves on to the next candidate', async () => {
  const asked: string[] = [];
  const guestOf = (id: string) => ({
    executeJavaScript: async () => { asked.push(id); return { release: id !== 'a' }; },
  }) as unknown as LiveGuest;
  assert.deepEqual(await releaseExcessViews({ candidates: ['a', 'b', 'c'], excess: 1, guestOf }), [{ id: 'b', parked: null }]);
  assert.deepEqual(asked, ['a', 'b'], 'c was never asked: one release was enough');
});

test('the scroll script carries only numbers', () => {
  const script = scrollScript({ parked: { url: 'http://127.0.0.1:4100/', x: 5, y: Number.NaN, innerY: 300 } });
  assert.match(script, /window\.scrollTo\(5, 0\)/);
  assert.match(script, /inner\.scrollTop = 300;/);
  assert.doesNotMatch(script, /NaN/);
});

test('a restored guest gets its scroll back on its first finished load only, and a teardown detaches it', () => {
  const listeners = new Map<string, () => void>();
  const scripts: string[] = [];
  const guest = {
    addEventListener: (event: string, listener: () => void) => { listeners.set(event, listener); },
    removeEventListener: (event: string, listener: () => void) => { if (listeners.get(event) === listener) listeners.delete(event); },
    executeJavaScript: async (code: string) => { scripts.push(code); },
  } as unknown as ScrollGuest;
  const parked = { url: 'http://127.0.0.1:4100/admin/posts', x: 0, y: 0, innerY: 120 };
  assert.equal(restoreParkedScroll({ guest: null, parked }), undefined);
  assert.equal(restoreParkedScroll({ guest, parked: undefined }), undefined);
  const teardown = restoreParkedScroll({ guest, parked });
  listeners.get('did-finish-load')!();
  assert.equal(listeners.has('did-finish-load'), false);
  assert.deepEqual(scripts, [scrollScript({ parked })]);
  restoreParkedScroll({ guest, parked });
  assert.ok(listeners.has('did-finish-load'));
  teardown?.();
  assert.ok(listeners.has('did-finish-load'), 'a stale teardown does not detach a newer listener');
});
