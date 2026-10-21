/**
 * @file `useSitePower` rendered from its real module under jsdom (see `dom-hook-harness.ts`), with
 * the desktop bridge injected through its `getBridge` port — no module mocks. The decision helpers
 * have their own direct tests in `use-site-power.hooks.test.ts`; this file asserts what the hook
 * itself owns: the pending/error maps, the synchronous in-flight lock, the confirm, and restart.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SiteRecord } from '../contracts/project.js';
import { renderHook, settle } from './dom-hook-harness.js';
import { useSitePower } from './use-site-power.hooks.js';

type Bridge = { startSite: (id: string) => Promise<SiteRecord>; stopSite: (id: string) => Promise<SiteRecord> };

const SITE = { id: '/sites/a', displayName: 'Alpha', status: 'stopped', port: 4321 } as unknown as SiteRecord;
const at = (status: SiteRecord['status'], extra: Partial<SiteRecord> = {}): SiteRecord => ({ ...SITE, status, ...extra });

/** A bridge whose calls stay pending until the test settles them, recording every call in order. */
function deferredBridge() {
  const calls: string[] = [];
  const pending: { resolve: (record: SiteRecord) => void; reject: (error: unknown) => void }[] = [];
  const call = (name: string) => (id: string) => {
    calls.push(`${name}:${id}`);
    return new Promise<SiteRecord>((resolve, reject) => { pending.push({ resolve, reject }); });
  };
  const bridge: Bridge = { startSite: call('start'), stopSite: call('stop') };
  return { bridge, calls, next: () => pending.shift()! };
}

test('a Start reads as starting until main answers, then applies main\'s record and opens the site', async (t) => {
  const fake = deferredBridge();
  const events: string[] = [];
  const hook = renderHook(t, () => useSitePower(
    (record) => events.push(`updated:${record.status}`),
    { onStarted: (id) => events.push(`open:${id}`), getBridge: () => fake.bridge },
  ));
  assert.equal(hook.current().statusOf(SITE), 'stopped', 'no press yet: the polled status');
  const press = hook.current().toggle(SITE);
  await settle();
  assert.equal(hook.current().statusOf(SITE), 'starting');
  await hook.current().toggle(SITE);
  assert.deepEqual(fake.calls, ['start:/sites/a'], 'a second press during the start is inert');
  fake.next().resolve(at('running'));
  await press;
  await settle();
  assert.deepEqual(events, ['updated:running', 'open:/sites/a']);
  assert.equal(hook.current().statusOf(SITE), 'stopped', 'the pending mark is gone; the poll owns the status again');
  assert.equal(hook.current().errorOf(SITE.id), null);
});

test('a failed Stop shows main\'s sentence, clears the pending mark, and the next press clears the error', async (t) => {
  const fake = deferredBridge();
  const hook = renderHook(t, () => useSitePower(undefined, { getBridge: () => fake.bridge }));
  const running = at('running');
  const press = hook.current().toggle(running);
  await settle();
  assert.equal(hook.current().statusOf(running), 'stopping');
  fake.next().reject(new Error('the child would not exit'));
  await press;
  await settle();
  assert.equal(hook.current().errorOf(running.id), 'the child would not exit');
  assert.equal(hook.current().statusOf(running), 'running');
  const retry = hook.current().toggle(running);
  await settle();
  assert.equal(hook.current().errorOf(running.id), null, 'a new press clears the old failure at once');
  fake.next().resolve(at('stopped'));
  await retry;
});

test('statuses with no honest button make a press a no-op that never reaches the bridge', async (t) => {
  const fake = deferredBridge();
  const hook = renderHook(t, () => useSitePower(undefined, { getBridge: () => fake.bridge }));
  await hook.current().toggle(at('provisioning'));
  await hook.current().toggle(at('running', { externalUrl: 'http://localhost:3000/' }));
  assert.deepEqual(fake.calls, []);
  assert.equal(hook.current().confirmingStopId, null, 'an unstoppable external site cannot even ask');
});

test('Stop on a site another process serves asks first; Cancel drops it and Confirm stops it', async (t) => {
  const fake = deferredBridge();
  const hook = renderHook(t, () => useSitePower(undefined, { getBridge: () => fake.bridge }));
  const dev = at('running', { externalUrl: 'http://localhost:3000/', externalLauncher: 'npm-run-dev' });
  await hook.current().toggle(dev);
  await settle();
  assert.equal(hook.current().confirmingStopId, dev.id);
  hook.current().cancelStop!();
  await settle();
  assert.equal(hook.current().confirmingStopId, null);
  assert.deepEqual(fake.calls, []);
  await hook.current().toggle(dev);
  await settle();
  const confirming = hook.current().confirmStop!(dev);
  await settle();
  assert.equal(hook.current().confirmingStopId, null);
  assert.deepEqual(fake.calls, ['stop:/sites/a']);
  fake.next().resolve(at('stopped'));
  await confirming;
});

test('Restart stops, reports the stopped record, starts, and reads as restarting meanwhile', async (t) => {
  const fake = deferredBridge();
  const updates: string[] = [];
  const hook = renderHook(t, () => useSitePower((record) => updates.push(record.status), { getBridge: () => fake.bridge }));
  const running = at('running');
  assert.equal(hook.current().restartControlOf(running).label, 'Restart');
  const restarting = hook.current().restart(running);
  await settle();
  assert.equal(hook.current().statusOf(running), 'starting');
  assert.equal(hook.current().restartControlOf(running).label, 'Restarting…');
  await hook.current().restart(running);
  fake.next().resolve(at('stopped'));
  await settle();
  fake.next().resolve(at('running'));
  await restarting;
  await settle();
  assert.deepEqual(fake.calls, ['stop:/sites/a', 'start:/sites/a'], 'the second restart press was inert');
  assert.deepEqual(updates, ['stopped', 'running']);
  assert.equal(hook.current().statusOf(running), 'running');
});

test('a Restart whose start fails shows the failure; a disabled Restart never reaches the bridge', async (t) => {
  const fake = deferredBridge();
  const hook = renderHook(t, () => useSitePower(undefined, { getBridge: () => fake.bridge }));
  const running = at('running');
  const restarting = hook.current().restart(running);
  fake.next().resolve(at('stopped'));
  await settle();
  fake.next().reject(new Error('port 4321 is taken'));
  await restarting;
  await settle();
  assert.match(hook.current().errorOf(running.id) ?? '', /port 4321/);
  assert.equal(hook.current().statusOf(running), 'running');
  const callsBefore = fake.calls.length;
  await hook.current().restart(at('stopped'));
  await hook.current().restart(at('running', { folderMissing: true }));
  assert.equal(fake.calls.length, callsBefore);
});

test('with no bridge wired, a press reports the unavailable bridge on the card', async (t) => {
  const hook = renderHook(t, () => useSitePower(undefined, { getBridge: () => undefined }));
  await hook.current().toggle(SITE);
  await settle();
  assert.equal(hook.current().errorOf(SITE.id), 'The desktop bridge is unavailable.');
});
