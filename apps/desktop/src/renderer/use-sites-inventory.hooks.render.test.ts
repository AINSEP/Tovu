/**
 * @file `useSitesPolling`, `useSiteRescan` and `useApplySiteRecord` rendered from their real module
 * under jsdom (`app-hooks.test-support.ts`), with the bridge lookup and the interval starter
 * injected as ports. Moved from `App.hooks.render.test.ts` with the split.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { act, useState, type Dispatch, type SetStateAction } from 'react';
import type { SiteRecord } from '../contracts/project.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { deferred, renderHookWithView as renderHook, settle, site } from './app-hooks.test-support.js';
import { useApplySiteRecord, useSiteRescan, useSitesPolling } from './use-sites-inventory.hooks.js';

// ── useSitesPolling ──────────────────────────────────────────────────────────────────────────────

test('useSitesPolling: without a bridge it stops loading and never starts the interval', (t) => {
  let started = 0;
  const hook = renderHook(t, () => useSitesPolling({}, { getBridge: () => undefined, startInterval: () => { started++; return () => {}; } }));
  assert.deepEqual({ ...hook.current(), setProjects: undefined }, { projects: [], setProjects: undefined, projectsLoading: false, loadError: null });
  assert.equal(started, 0);
});

test('useSitesPolling: loads, re-polls on each tick, reports a failed poll, and recovers on the next', async (t) => {
  const responses: Promise<readonly SiteRecord[]>[] = [];
  const bridge = { listSites: () => responses.shift()! };
  const ticks: (() => void)[] = [];
  let stopped = 0;
  const startInterval = (tick: () => void, periodMs: number) => { assert.equal(periodMs, 4000); ticks.push(tick); return () => { stopped++; }; };
  const getBridge = () => bridge;
  responses.push(Promise.resolve([site('a')]));
  const hook = renderHook(t, () => useSitesPolling({}, { getBridge, startInterval }));
  assert.equal(hook.current().projectsLoading, true);
  await settle();
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['a']);
  assert.equal(hook.current().projectsLoading, false);

  responses.push(Promise.reject(new Error('IPC down')));
  ticks[0]!();
  await settle();
  assert.equal(hook.current().loadError, "Couldn't load projects.");
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['a'], 'a failed poll keeps the last good list');

  responses.push(Promise.resolve([site('a'), site('b')]));
  ticks[0]!();
  await settle();
  assert.equal(hook.current().loadError, null);
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['a', 'b']);
  hook.unmount();
  assert.equal(stopped, 1);
});

test('useSitesPolling: a lookup that changes drops every result the previous one still had in flight', async (t) => {
  const first = { initial: deferred<readonly SiteRecord[]>(), tick: deferred<readonly SiteRecord[]>() };
  const queue = [first.initial.promise, first.tick.promise];
  const oldBridge = { listSites: () => queue.shift()! };
  const fresh = deferred<readonly SiteRecord[]>();
  const newBridge = { listSites: () => fresh.promise };
  const ticks: (() => void)[] = [];
  const stops: number[] = [];
  const startInterval = (tick: () => void) => { ticks.push(tick); const index = ticks.length; return () => stops.push(index); };
  let getBridge: () => { listSites: () => Promise<readonly SiteRecord[]> } = () => oldBridge;
  const hook = renderHook(t, () => useSitesPolling({}, { getBridge, startInterval }));
  ticks[0]!();
  getBridge = () => newBridge;
  hook.rerender();
  assert.deepEqual(stops, [1], 'the old interval is stopped when the lookup changes');

  first.initial.resolve([site('stale')]);
  first.tick.reject(new Error('late failure'));
  await settle();
  assert.deepEqual(hook.current().projects, []);
  assert.equal(hook.current().loadError, null);
  assert.equal(hook.current().projectsLoading, true, 'a stale load does not end the loading state either');

  fresh.resolve([site('fresh')]);
  await settle();
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['fresh']);
  assert.equal(hook.current().projectsLoading, false);
});

test('useSitesPolling: a poll that started before a local write is dropped, and the next poll applies', async (t) => {
  const inFlight = deferred<readonly SiteRecord[]>();
  const responses = [Promise.resolve([site('a')]), inFlight.promise, Promise.resolve([site('a'), site('server')])];
  const getBridge = () => ({ listSites: () => responses.shift()! });
  let tick!: () => void;
  const startInterval = (callback: () => void) => { tick = callback; return () => {}; };
  const hook = renderHook(t, () => useSitesPolling({}, { getBridge, startInterval }));
  await settle();
  act(() => tick());
  act(() => hook.current().setProjects((current) => [...current, site('local')]));
  inFlight.resolve([site('a')]);
  await settle();
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['a', 'local'], 'the older snapshot cannot erase the local write');
  act(() => tick());
  await settle();
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['a', 'server'], 'a poll started after the write applies normally');
});

// ── useSiteRescan ────────────────────────────────────────────────────────────────────────────────

function useRescanWithList(getBridge: () => Pick<RunnerInventoryBridge, 'rescanSites'> | undefined) {
  const [projects, setProjects] = useState<readonly SiteRecord[]>([site('kept')]);
  return { projects, ...useSiteRescan(setProjects, { getBridge }) };
}

test('useSiteRescan: applies the returned list at once and shows scanning only while the call is open', async (t) => {
  // Discarding the result would leave the operator staring at the old grid for up to 4 s after a
  // rescan that had already found their site — indistinguishable, to them, from the button not working.
  const pending = deferred<readonly SiteRecord[]>();
  const getBridge = () => ({ rescanSites: () => pending.promise });
  const hook = renderHook(t, () => useRescanWithList(getBridge));
  let done!: Promise<void>;
  act(() => { done = hook.current().rescan(); });
  assert.equal(hook.current().rescanning, true);
  pending.resolve([site('kept'), site('found')]);
  await act(() => done);
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['kept', 'found']);
  assert.equal(hook.current().rescanning, false);
  assert.equal(hook.current().rescanError, null);
});

test('useSiteRescan: a failed scan keeps the grid, reports Error and non-Error reasons, and clears on retry', async (t) => {
  // The projects already listed stay real and openable whatever a scan did. Found by driving the
  // real app: routing the rescan error through `ProjectsBody`'s `loadError` early return blanked
  // every project the operator already had — indistinguishable from "all my sites vanished". That
  // the error renders BESIDE the grid is `app/MainContent.render.test.ts`'s ProjectsBody case.
  const outcomes: (() => Promise<readonly SiteRecord[]>)[] = [
    () => Promise.reject(new Error('scan root unreadable')),
    () => Promise.reject('plain refusal'),
    () => Promise.resolve([site('kept')]),
  ];
  const getBridge = () => ({ rescanSites: () => outcomes.shift()!() });
  const hook = renderHook(t, () => useRescanWithList(getBridge));
  await act(() => hook.current().rescan());
  assert.equal(hook.current().rescanError, 'scan root unreadable');
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['kept']);
  await act(() => hook.current().rescan());
  assert.equal(hook.current().rescanError, 'plain refusal');
  await act(() => hook.current().rescan());
  assert.equal(hook.current().rescanError, null);
  assert.equal(hook.current().rescanning, false);
});

test('useSiteRescan: without a bridge the button does nothing at all', async (t) => {
  const getBridge = () => undefined;
  const hook = renderHook(t, () => useRescanWithList(getBridge));
  await act(() => hook.current().rescan());
  assert.deepEqual({ rescanning: hook.current().rescanning, rescanError: hook.current().rescanError }, { rescanning: false, rescanError: null });
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['kept']);
});

// ── useApplySiteRecord ──────────────────────────────────────────────────────────────────────────

function useProjectsWith<T>(initial: readonly SiteRecord[], useRest: (setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>) => T) {
  const [projects, setProjects] = useState<readonly SiteRecord[]>(initial);
  return { projects, ...useRest(setProjects) };
}

// Main's refreshed record is applied at once rather than waiting on the 4 s poll: for a start or a
// stop those four seconds are the whole problem — the card would go on saying `Running` after the
// operator watched their stop succeed. The App-level wiring is `App.sites-home.render.test.ts`.
test('useApplySiteRecord: replaces the matching row, merges a located site into one card, and drops unknown ids', (t) => {
  const hook = renderHook(t, () => useProjectsWith([site('a'), site('b'), site('c')], (set) => ({ apply: useApplySiteRecord(set) })));
  act(() => hook.current().apply(site('b', { status: 'running' })));
  assert.deepEqual(hook.current().projects.map((p) => `${p.id}:${p.status}`), ['a:stopped', 'b:running', 'c:stopped']);
  // A missing-folder card's Locate comes back under its NEW folder id and replaces the card at
  // once, not on the next poll. A Locate onto a folder that already has a card merges into it: that
  // card must not stay twice.
  act(() => hook.current().apply(site('c', { displayName: 'located' }), 'a'));
  assert.deepEqual(hook.current().projects.map((p) => `${p.id}:${p.displayName}`), ['c:located', 'b:b']);
  act(() => hook.current().apply(site('ghost')));
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['c', 'b']);
});

test('useApplySiteRecord: keeps one stable callback per setter', (t) => {
  const hook = renderHook(t, () => useProjectsWith([site('a')], (set) => ({ apply: useApplySiteRecord(set) })));
  const first = hook.current().apply;
  hook.rerender();
  assert.equal(hook.current().apply, first);
});
