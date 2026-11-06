/**
 * @file The ask when a site's tab closes, from its real module under jsdom: when it asks, what each
 * answer does, and that a failed stop keeps the tab and says why.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import type { SiteRecord } from '../contracts/project.js';
import { deferred, renderHookWithView as renderHook } from './app-hooks.test-support.js';
import { installDom } from './dom-hook-harness.js';
import { tabCloseAsksToStop, tabCloseCopy, useTabCloseAsk } from './use-tab-close-ask.hooks.js';

const window = installDom();

function site(overrides: Partial<SiteRecord> = {}): SiteRecord {
  return { id: 'a', displayName: 'Shop', status: 'running', ...overrides } as SiteRecord;
}

function harness(t: Parameters<typeof renderHook>[0], { projects = [site()], stopSite = async (id: string) => site({ id, status: 'stopped' }) as SiteRecord, keepSiteRunning = async () => {} }: {
  projects?: readonly SiteRecord[]; stopSite?: (id: string) => Promise<SiteRecord>; keepSiteRunning?: () => Promise<void>;
} = {}) {
  const closed: string[] = [];
  const keptRunning: string[] = [];
  const updated: SiteRecord[] = [];
  const stops: string[] = [];
  const hook = renderHook(t, () => useTabCloseAsk(
    { projects, closeTab: (id) => closed.push(id), onSiteUpdated: (record) => updated.push(record) },
    { getBridge: () => ({ keepSiteRunning: async ({ id }: { id: string }) => { keptRunning.push(id); await keepSiteRunning(); }, startSite: async () => site(), stopSite: (id: string) => { stops.push(id); return stopSite(id); } }) },
  ));
  return { hook, closed, updated, stops, keptRunning };
}

test('only a site this app can stop is asked about', () => {
  assert.equal(tabCloseAsksToStop({ project: site() }), true);
  for (const status of ['stopped', 'sleeping', 'failed', 'starting', 'stopping'] as const) {
    assert.equal(tabCloseAsksToStop({ project: site({ status }) }), false, status);
  }
  assert.equal(tabCloseAsksToStop({ project: site({ externalUrl: 'http://127.0.0.1:1' }) }), false, 'no way to stop it');
  assert.equal(tabCloseAsksToStop({ project: site({ externalUrl: 'http://127.0.0.1:1', externalLauncher: 'npm-run-dev' }) }), true);
});

test('a stopped site closes at once with no ask', (t) => {
  const h = harness(t, { projects: [site({ status: 'stopped' })] });
  act(() => h.hook.current().requestClose('a'));
  assert.deepEqual(h.closed, ['a']);
  assert.equal(h.hook.current().asking, null);
});

test('Keep running holds idle sleep before closing the tab and stops nothing', async (t) => {
  const h = harness(t);
  act(() => h.hook.current().requestClose('a'));
  assert.equal(h.hook.current().asking?.id, 'a');
  assert.deepEqual(h.closed, [], 'nothing closes before the answer');
  await act(() => h.hook.current().keepRunning());
  assert.deepEqual(h.closed, ['a']);
  assert.deepEqual(h.stops, []);
  assert.deepEqual(h.keptRunning, ['a']);
  assert.equal(h.hook.current().asking, null);
});

test('Cancel and Escape leave the tab open and the site running; Escape waits out a stop', async (t) => {
  const slow = deferred<SiteRecord>();
  const h = harness(t, { stopSite: () => slow.promise });
  const escape = () => act(() => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); });
  act(() => h.hook.current().requestClose('a'));
  act(() => h.hook.current().cancel());
  assert.equal(h.hook.current().asking, null);
  act(() => h.hook.current().requestClose('a'));
  escape();
  assert.equal(h.hook.current().asking, null);
  assert.deepEqual([h.closed, h.stops], [[], []]);

  act(() => h.hook.current().requestClose('a'));
  let done!: Promise<void>;
  act(() => { done = h.hook.current().stopAndClose(); });
  assert.equal(h.hook.current().stopping, true);
  escape();
  assert.equal(h.hook.current().asking?.id, 'a', 'Escape cannot take back a stop already running');
  slow.resolve(site({ status: 'stopped' }));
  await act(() => done);
});

test('Stop site stops it, applies main\'s record, then closes the tab', async (t) => {
  const h = harness(t);
  act(() => h.hook.current().requestClose('a'));
  await act(() => h.hook.current().stopAndClose());
  assert.deepEqual(h.stops, ['a']);
  assert.equal(h.updated[0]?.status, 'stopped');
  assert.deepEqual(h.closed, ['a']);
  assert.equal(h.hook.current().asking, null);
  assert.equal(h.hook.current().stopping, false);
});

test('a failed stop keeps the tab open and shows main\'s reason; asking again starts clean', async (t) => {
  const h = harness(t, { stopSite: () => Promise.reject(new Error('the site did not stop in time')) });
  act(() => h.hook.current().requestClose('a'));
  await act(() => h.hook.current().stopAndClose());
  assert.deepEqual(h.closed, []);
  assert.equal(h.hook.current().asking?.id, 'a');
  assert.equal(h.hook.current().error, 'the site did not stop in time');
  assert.equal(h.hook.current().stopping, false);
  act(() => h.hook.current().cancel());
  act(() => h.hook.current().requestClose('a'));
  assert.equal(h.hook.current().error, null);
});

test('the ask names the site, and warns when Stop would end another process', () => {
  const plain = tabCloseCopy({ project: site({ displayName: 'Cost $& more' }) }, { locale: 'en' });
  assert.equal(plain.title, 'Stop Cost $& more too?', 'a name is text, never a replace pattern');
  assert.equal(plain.body, null);
  assert.deepEqual([plain.stop, plain.stopping, plain.keepRunning, plain.cancel], ['Stop', 'Stopping…', 'Keep running', 'Cancel']);
  const dev = tabCloseCopy({ project: site({ externalUrl: 'http://127.0.0.1:1', externalLauncher: 'npm-run-dev' }) }, { locale: 'en' });
  assert.match(dev.body ?? '', /npm run dev/);
});

test('finishing A stop preserves B close prompt and its answer', async (t) => {
  const slow = deferred<SiteRecord>();
  const h = harness(t, { projects: [site(), site({ id: 'b' })], stopSite: () => slow.promise });
  act(() => h.hook.current().requestClose('a'));
  let done!: Promise<void>;
  act(() => { done = h.hook.current().stopAndClose(); });
  act(() => h.hook.current().requestClose('b'));
  assert.equal(h.hook.current().asking?.id, 'b');
  assert.equal(h.hook.current().stopping, false, 'B has not been answered');
  slow.resolve(site({ status: 'stopped' }));
  await act(() => done);
  assert.deepEqual(h.closed, ['a']);
  assert.equal(h.hook.current().asking?.id, 'b');
  act(() => h.hook.current().cancel());
  assert.deepEqual(h.closed, ['a'], 'B can still be cancelled');
});

test('A stop failure cannot replace B close prompt with A error', async (t) => {
  const slow = deferred<SiteRecord>();
  const h = harness(t, { projects: [site(), site({ id: 'b' })], stopSite: () => slow.promise });
  act(() => h.hook.current().requestClose('a'));
  let done!: Promise<void>;
  act(() => { done = h.hook.current().stopAndClose(); });
  act(() => h.hook.current().requestClose('b'));
  slow.reject(new Error('A could not stop'));
  await act(() => done);
  assert.equal(h.hook.current().asking?.id, 'b');
  assert.equal(h.hook.current().error, null);
  assert.deepEqual(h.closed, []);
});


test('Keep running waits for main and preserves the tab with a reason when main refuses', async t => {
  const pending = deferred<void>();
  const h = harness(t, { keepSiteRunning: () => pending.promise });
  act(() => h.hook.current().requestClose('a'));
  let done!: Promise<void>;
  act(() => { done = h.hook.current().keepRunning(); });
  assert.deepEqual(h.closed, [], 'the hold must be accepted before tab presence is released');
  pending.reject(new Error('This site is no longer tracked.'));
  await act(() => done);
  assert.deepEqual(h.closed, []);
  assert.equal(h.hook.current().asking?.id, 'a');
  assert.equal(h.hook.current().error, 'This site is no longer tracked.');
  assert.equal(h.hook.current().stopping, false);
});
