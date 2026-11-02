/**
 * @file `useSitePower`'s one synchronous in-flight guard, shared by Restart and Start/Stop, rendered
 * from the real module under jsdom (`dom-hook-harness.ts`) with the bridge injected through its
 * `getBridge` port. Replaced the `sourceFunction(useSitePower…)` case in `site-restart.test.ts`;
 * the rest of the hook is covered in `use-site-power.hooks.render.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SiteRecord } from '../contracts/project.js';
import { renderHook, settle } from './dom-hook-harness.js';
import { useSitePower } from './use-site-power.hooks.js';

const RUNNING = { id: '/site', displayName: 'Site', status: 'running', port: 4321 } as unknown as SiteRecord;

test('rapid Restart and Stop presses share one synchronous guard, and a failed Restart releases it', async (t) => {
  // The one thing this control must never do is remember its own press: a failure must clear the
  // in-flight mark on its way out, or the card sticks on "Restarting…" with Start/Stop locked.
  const stops: { reject: (error: Error) => void }[] = [];
  const bridge = {
    stopSite: () => new Promise<SiteRecord>((_resolve, reject) => { stops.push({ reject }); }),
    startSite: async () => RUNNING,
  };
  const hook = renderHook(t, () => useSitePower(undefined, { getBridge: () => bridge }));
  const first = hook.current();
  const restarting = first.restart(RUNNING);
  // The same render's closures: nothing has re-rendered yet, so only the synchronous lock can
  // refuse these two — a fast second click uses the old closure.
  await first.restart(RUNNING);
  await first.toggle(RUNNING);
  assert.equal(stops.length, 1, 'three presses, one stop');
  await settle();
  assert.equal(hook.current().restartControlOf(RUNNING).label, 'Restarting…');

  stops[0]!.reject(new Error('stop failed'));
  await restarting;
  await settle();
  assert.equal(hook.current().errorOf(RUNNING.id), 'stop failed');
  assert.equal(hook.current().statusOf(RUNNING), 'running', 'the pending mark is gone');
  assert.equal(hook.current().restartControlOf(RUNNING).label, 'Restart');
  void hook.current().toggle(RUNNING);
  await settle();
  assert.equal(stops.length, 2, 'the guard was released: the next press reaches the bridge');
});
