/**
 * @file `useAppVersion` rendered from its real module under jsdom, with the bridge injected through
 * its `bridge` option (owner 2026-10-09: version loading belongs in the hook, with DI fakes and no
 * module mocks). Loading, an async failure, a missing method and a reply after unmount are covered
 * in `imported-hooks.hooks.test.ts`; the nav's rendering of the result in `app/TopNav.render.test.ts`.
 * This file holds the rest: one read per bridge, a replaced bridge, a synchronous throw, no preload.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunnerAppVersionBridge } from '../contracts/app-version.js';
import { deferred, renderHookWithView as renderHook, settle } from './app-hooks.test-support.js';
import { useAppVersion } from './use-app-version.hooks.js';

test('useAppVersion: reads the exact main-process version once and keeps it across re-renders', async (t) => {
  let reads = 0;
  const bridge = { getAppVersion: async () => { reads++; return '4.8.2-beta.5'; } };
  const hook = renderHook(t, () => useAppVersion({}, { bridge }));
  assert.deepEqual(hook.current(), { version: null, error: null });
  await settle();
  hook.rerender();
  hook.rerender();
  assert.deepEqual(hook.current(), { version: '4.8.2-beta.5', error: null });
  assert.equal(reads, 1);
});

test('useAppVersion: a replacement bridge drops the old request\'s reply, and one without the method clears the version', async (t) => {
  const first = deferred<string>();
  const second = deferred<string>();
  let bridge: Partial<RunnerAppVersionBridge> = { getAppVersion: () => first.promise };
  const hook = renderHook(t, () => useAppVersion({}, { bridge }));
  bridge = { getAppVersion: () => second.promise };
  hook.rerender();
  first.resolve('2.3.4');
  await settle();
  assert.deepEqual(hook.current(), { version: null, error: null }, 'the superseded bridge\'s reply is ignored');
  second.resolve('3.4.5');
  await settle();
  assert.deepEqual(hook.current(), { version: '3.4.5', error: null });
  bridge = {};
  hook.rerender();
  assert.deepEqual(hook.current(), { version: null, error: null }, 'a stale preload without getAppVersion shows no stale version');
});

test('useAppVersion: a bridge that throws before returning a promise keeps its exact text as the error', async (t) => {
  const bridge = { getAppVersion: (): Promise<string> => { throw 'Version bridge disconnected'; } };
  const hook = renderHook(t, () => useAppVersion({}, { bridge }));
  await settle();
  assert.deepEqual(hook.current(), { version: null, error: 'Version bridge disconnected' });
});

test('useAppVersion: with no preload bridge at all the brand stays usable — no version and no error', async (t) => {
  const hook = renderHook(t, () => useAppVersion({}));
  await settle();
  assert.equal(window.tovuRunner, undefined, 'no preload in this test process');
  assert.deepEqual(hook.current(), { version: null, error: null });
});
