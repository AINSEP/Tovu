/**
 * @file `useSiteStart` rendered from its real module under jsdom with the bridge lookup injected.
 * Moved from `App.hooks.render.test.ts` with the split; the plain functions beside it are tested in
 * `use-site-start.hooks.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act } from 'react';
import type { SiteRecord } from '../contracts/project.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { deferred, renderHookWithView as renderHook, site } from './app-hooks.test-support.js';
import { useSiteStart } from './use-site-start.hooks.js';

test("useSiteStart: success hands main's record on and resolves true; a missing bridge or a rejection resolves false with a reason", async (t) => {
  const applied: SiteRecord[] = [];
  const running = site('a', { status: 'running', port: 4321 });
  const pending = deferred<SiteRecord>();
  let getBridge: () => Pick<RunnerInventoryBridge, 'startSite'> | undefined = () => ({ startSite: () => pending.promise });
  const hook = renderHook(t, () => useSiteStart(site('a'), (record) => applied.push(record), { getBridge }));
  let started!: Promise<boolean>;
  act(() => { started = hook.current().start(); });
  assert.equal(hook.current().starting, true);
  pending.resolve(running);
  assert.equal(await act(() => started), true);
  assert.deepEqual(applied, [running]);
  assert.equal(hook.current().starting, false);

  getBridge = () => undefined;
  hook.rerender();
  assert.equal(await act(() => hook.current().start()), false);
  assert.equal(hook.current().error, 'Tovu desktop connection required to start a website.');

  getBridge = () => ({ startSite: () => Promise.reject(new Error('port 4321 is taken')) });
  const quiet = renderHook(t, () => useSiteStart(site('b'), undefined, { getBridge }));
  assert.equal(await act(() => quiet.current().start()), false);
  assert.equal(quiet.current().error, 'port 4321 is taken');
  assert.equal(quiet.current().starting, false);
  assert.equal(applied.length, 1);
});

test('useSiteStart: a retry clears the previous error, and a success without onSiteUpdated still resolves true', async (t) => {
  const outcomes = [() => Promise.reject(new Error('port 4321 is taken')), () => Promise.resolve(site('a', { status: 'running' }))];
  const ids: string[] = [];
  const getBridge = () => ({ startSite: (id: string) => { ids.push(id); return outcomes.shift()!(); } });
  const hook = renderHook(t, () => useSiteStart(site('/sites/a'), undefined, { getBridge }));
  assert.equal(await act(() => hook.current().start()), false);
  assert.equal(hook.current().error, 'port 4321 is taken');
  assert.equal(await act(() => hook.current().start()), true);
  assert.deepEqual([hook.current().error, hook.current().starting], [null, false]);
  assert.deepEqual(ids, ['/sites/a', '/sites/a'], "the start is for this panel's own project");
});
