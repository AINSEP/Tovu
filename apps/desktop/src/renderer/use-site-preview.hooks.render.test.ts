/**
 * @file `useSitePreview` rendered from its real module under jsdom (see `dom-hook-harness.ts`),
 * with the bridge injected through its `getBridge` port. The plan/next-url decisions have direct
 * tests in `use-site-preview.hooks.test.ts`; this file asserts the effect: fetch per version, clear
 * on a null version, keep nothing on failure, and never let a stale reply clobber a newer one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { renderHook, settle } from './dom-hook-harness.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { useSitePreview } from './use-site-preview.hooks.js';

/** A bridge whose `getSitePreview` calls stay pending until the test settles them. */
function previewBridge() {
  const asked: string[] = [];
  const pending: { resolve: (url: string | null) => void; reject: (error: unknown) => void }[] = [];
  const bridge = {
    getSitePreview: (id: string) => {
      asked.push(id);
      return new Promise<string | null>((resolve, reject) => { pending.push({ resolve, reject }); });
    },
  } as unknown as RunnerInventoryBridge;
  const getBridge = () => bridge;
  return { getBridge, asked, next: () => pending.shift()! };
}

test('a version fetches its capture once; a null version clears what was shown', async (t) => {
  const fake = previewBridge();
  let version: number | null = 1;
  const hook = renderHook(t, () => useSitePreview('/sites/a', version, { getBridge: fake.getBridge }));
  assert.equal(hook.current(), null, 'nothing until the fetch resolves');
  fake.next().resolve('file:///previews/a-1.png');
  await settle();
  assert.equal(hook.current(), 'file:///previews/a-1.png');
  hook.rerender();
  assert.deepEqual(fake.asked, ['/sites/a'], 'a rerender with the same version does not refetch');
  version = null;
  hook.rerender();
  await settle();
  assert.equal(hook.current(), null);
});

test('a failed fetch renders no image', async (t) => {
  const fake = previewBridge();
  const hook = renderHook(t, () => useSitePreview('/sites/a', 3, { getBridge: fake.getBridge }));
  fake.next().reject(new Error('capture unreadable'));
  await settle();
  assert.equal(hook.current(), null);
});

test('a reply or failure from a superseded version never overwrites the newer one', async (t) => {
  const fake = previewBridge();
  let version = 1;
  const hook = renderHook(t, () => useSitePreview('/sites/a', version, { getBridge: fake.getBridge }));
  const first = fake.next();
  version = 2;
  hook.rerender();
  const second = fake.next();
  version = 3;
  hook.rerender();
  const third = fake.next();
  third.resolve('file:///previews/a-3.png');
  await settle();
  first.resolve('file:///previews/a-1.png');
  second.reject(new Error('late failure'));
  await settle();
  assert.equal(hook.current(), 'file:///previews/a-3.png');
});

test('with no bridge there is nothing to ask, so nothing is shown', async (t) => {
  const getBridge = () => undefined;
  const hook = renderHook(t, () => useSitePreview('/sites/a', 1, { getBridge }));
  await settle();
  assert.equal(hook.current(), null);
});

test('two sites that share a version number each fetch their own capture', async (t) => {
  const fake = previewBridge();
  let id = '/sites/a';
  const hook = renderHook(t, () => useSitePreview(id, 7, { getBridge: fake.getBridge }));
  fake.next().resolve('file:///previews/a-7.png');
  await settle();
  id = '/sites/b';
  hook.rerender();
  fake.next().resolve('file:///previews/b-7.png');
  await settle();
  assert.deepEqual(fake.asked, ['/sites/a', '/sites/b']);
  assert.equal(hook.current(), 'file:///previews/b-7.png');
});
