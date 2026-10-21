/**
 * @file The stateful hooks in `App.hooks.ts`, rendered from the REAL module under jsdom so their
 * effects, callbacks and race guards run as React runs them. `App.hooks.test.ts` covers the plain
 * rules and evaluates a few hook bodies through `sourceFunction`, which lcov cannot attribute to the
 * file; this is the half that can.
 *
 * Every bridge-reading hook takes its desktop-bridge lookup as an optional `getBridge` port (see
 * `BridgeLookup` in `App.hooks.ts`), the polling hook its interval starter, and the load-failure hook
 * its timers — so each test hands in a hand-written fake and controls exactly when a promise settles.
 * No module mocks; `window.tovuRunner` is never set here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChatMessage } from '@jini-ai/chat/core';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { CreatedSiteRecord, CreateSiteInput, SiteRecord } from '../contracts/project.js';
import type { WorkspaceConversationSummary } from '../contracts/workspace-conversations.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { SITE_NAME_ERROR } from '../contracts/site-name.js';
import {
  useApplySiteRecord,
  useConversationDeleteConfirmation,
  useCreateWebsiteForm,
  useDeleteConfirmation,
  useDismissibleDropdown,
  useExpandedMode,
  useMenuKeyboard,
  useProjectMutations,
  useProjectTabs,
  useRunnerConversations,
  useRunnerNavigation,
  useSectionNav,
  useSiteRescan,
  useSiteStart,
  useSitesPolling,
  useWebviewLoadFailure,
  useWorkspaceChatTransport,
} from './App.hooks.js';

type TestContext = { after: (fn: () => void) => void; mock: { method: (obj: object, name: string, impl?: (...args: never[]) => unknown) => { mock: { callCount: () => number } } } };

// One jsdom for the whole file: node --test runs each test file in its own process.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });

/** Render `useHook` (optionally with markup built from its result) into its own jsdom root. */
function renderHook<T>(t: TestContext, useHook: () => T, view: (value: T) => ReactNode = () => null) {
  let latest: T;
  function Probe() { latest = useHook(); return view(latest); }
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; act(() => root.unmount()); } };
  t.after(unmount);
  act(() => root.render(createElement(Probe)));
  return { current: () => latest!, rerender: () => act(() => root.render(createElement(Probe))), unmount };
}

const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve)); });

/** A promise whose settling the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function site(id: string, fields: Partial<SiteRecord> = {}): SiteRecord {
  return { id, displayName: id, status: 'stopped', folderMissing: false, port: 0, ...fields } as SiteRecord;
}

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

// ── useSiteRescan ────────────────────────────────────────────────────────────────────────────────

function useRescanWithList(getBridge: () => Pick<RunnerInventoryBridge, 'rescanSites'> | undefined) {
  const [projects, setProjects] = useState<readonly SiteRecord[]>([site('kept')]);
  return { projects, ...useSiteRescan(setProjects, { getBridge }) };
}

test('useSiteRescan: applies the returned list at once and shows scanning only while the call is open', async (t) => {
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

// ── useRunnerNavigation, useSectionNav, useProjectTabs ──────────────────────────────────────────

function useNavigationShell(getBridge: () => Pick<RunnerInventoryBridge, 'onNavigate'> | undefined) {
  const tabs = useProjectTabs();
  const nav = useSectionNav(tabs.setActiveTab);
  useRunnerNavigation(nav.setActiveId, tabs.setActiveTab, { getBridge });
  return { tabs, nav };
}

test('useRunnerNavigation: an agent navigate moves the section and returns to the sites home tab, then detaches', (t) => {
  const listeners = new Set<(section: RunnerSectionId) => void>();
  const getBridge = () => ({ onNavigate: (listener: (section: RunnerSectionId) => void) => { listeners.add(listener); return () => listeners.delete(listener); } });
  const hook = renderHook(t, () => useNavigationShell(getBridge));
  act(() => hook.current().tabs.openProjectTab('a'));
  act(() => hook.current().nav.startCreating());
  assert.equal(listeners.size, 1);
  act(() => { for (const listener of listeners) listener('agents' as RunnerSectionId); });
  assert.equal(hook.current().nav.activeId, 'agents');
  assert.equal(hook.current().tabs.activeTab, null);
  assert.equal(hook.current().nav.isCreating, true, 'agent navigation deliberately leaves the create form alone');
  hook.unmount();
  assert.equal(listeners.size, 0);
});

test('useRunnerNavigation: without a bridge nothing subscribes and the nav stays put', (t) => {
  const hook = renderHook(t, () => useNavigationShell(() => undefined));
  assert.equal(hook.current().nav.activeId, 'projects');
});

test('useSectionNav: a section click resets create, Appearance and the open tab; Appearance drops the tab', (t) => {
  const hook = renderHook(t, () => useNavigationShell(() => undefined));
  act(() => hook.current().tabs.openProjectTab('a'));
  act(() => hook.current().nav.openAppearance());
  assert.equal(hook.current().nav.appearanceOpen, true);
  assert.equal(hook.current().tabs.activeTab, null);
  act(() => hook.current().nav.closeAppearance());
  assert.equal(hook.current().nav.appearanceOpen, false);
  act(() => hook.current().tabs.setActiveTab('a'));
  act(() => hook.current().nav.startCreating());
  act(() => hook.current().nav.openAppearance());
  act(() => hook.current().nav.selectSection('agents' as RunnerSectionId));
  const { nav, tabs } = hook.current();
  assert.deepEqual({ activeId: nav.activeId, isCreating: nav.isCreating, appearanceOpen: nav.appearanceOpen, activeTab: tabs.activeTab },
    { activeId: 'agents', isCreating: false, appearanceOpen: false, activeTab: null });
  act(() => hook.current().nav.startCreating());
  act(() => hook.current().nav.stopCreating());
  assert.equal(hook.current().nav.isCreating, false);
  assert.deepEqual(hook.current().tabs.openTabs, ['a'], 'moving section never closes tabs');
});

test('useProjectTabs: opening adds once and selects, remembers an admin page, and closing picks a neighbour', (t) => {
  const hook = renderHook(t, () => useProjectTabs());
  act(() => hook.current().openProjectTab('a'));
  act(() => hook.current().openProjectTab('b', { adminPage: 'import' }));
  act(() => hook.current().openProjectTab('c'));
  act(() => hook.current().openProjectTab('a'));
  assert.deepEqual(hook.current().openTabs, ['a', 'b', 'c']);
  assert.equal(hook.current().activeTab, 'a');
  const pages = hook.current().adminPages;
  assert.deepEqual(pages, { b: 'import' });
  act(() => hook.current().openProjectTab('b', { adminPage: 'import' }));
  assert.equal(hook.current().adminPages, pages, 'reopening on the same page keeps the same record');
  act(() => hook.current().closeProjectTab('c'));
  assert.equal(hook.current().adminPages, pages, 'closing a tab with no page leaves the pages untouched');
  assert.equal(hook.current().activeTab, 'b', 'reopening b selected it');
  act(() => hook.current().closeProjectTab('b'));
  assert.deepEqual(hook.current().openTabs, ['a']);
  assert.equal(hook.current().activeTab, 'a');
  assert.deepEqual(hook.current().adminPages, {});
});

// ── useApplySiteRecord, useProjectMutations ─────────────────────────────────────────────────────

function useProjectsWith<T>(initial: readonly SiteRecord[], useRest: (setProjects: (next: (current: readonly SiteRecord[]) => readonly SiteRecord[]) => void, projects: readonly SiteRecord[]) => T) {
  const [projects, setProjects] = useState<readonly SiteRecord[]>(initial);
  return { projects, ...useRest(setProjects, projects) };
}

test('useApplySiteRecord: replaces the matching row, merges a located site into one card, and drops unknown ids', (t) => {
  const hook = renderHook(t, () => useProjectsWith([site('a'), site('b'), site('c')], (set) => ({ apply: useApplySiteRecord(set) })));
  act(() => hook.current().apply(site('b', { status: 'running' })));
  assert.deepEqual(hook.current().projects.map((p) => `${p.id}:${p.status}`), ['a:stopped', 'b:running', 'c:stopped']);
  act(() => hook.current().apply(site('c', { displayName: 'located' }), 'a'));
  assert.deepEqual(hook.current().projects.map((p) => `${p.id}:${p.displayName}`), ['c:located', 'b:b']);
  act(() => hook.current().apply(site('ghost')));
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['c', 'b']);
});

function mutationsHarness(t: TestContext, bridge: Pick<RunnerInventoryBridge, 'createSite' | 'deleteSite'> | undefined) {
  const calls: string[] = [];
  const getBridge = () => bridge;
  const hook = renderHook(t, () => useProjectsWith([site('a'), site('b')], (setProjects, projects) => useProjectMutations({
    setProjects, projects,
    closeProjectTab: (id) => calls.push(`close:${id}`),
    stopCreating: () => calls.push('stop'),
    startCreating: () => calls.push('start'),
  }, { getBridge })));
  return { hook, calls };
}

const CREATED: CreatedSiteRecord = { ...site('new'), agentPluginTokens: { status: 'saved', pluginIds: ['x'] } };
const INPUT: CreateSiteInput = { displayName: 'new', database: { kind: 'sqlite' } };

test('useProjectMutations: a create appends the plain record, keeps the full result for the notice, and resets the form', async (t) => {
  const inputs: CreateSiteInput[] = [];
  const { hook, calls } = mutationsHarness(t, { createSite: async (input) => { inputs.push(input); return CREATED; }, deleteSite: async () => {} });
  const key = hook.current().createFormKey;
  await act(() => hook.current().handleCreate(INPUT));
  assert.deepEqual(inputs, [INPUT]);
  assert.deepEqual(hook.current().projects.at(-1), site('new'), 'the token outcome stays off the grid row');
  assert.equal(hook.current().lastCreated, CREATED);
  assert.deepEqual(calls, ['stop']);
  assert.equal(hook.current().createFormKey, key + 1);
});

test('useProjectMutations: a cancelled picker keeps the form, and a missing bridge throws before touching anything', async (t) => {
  const { hook, calls } = mutationsHarness(t, { createSite: async () => null, deleteSite: async () => {} });
  const key = hook.current().createFormKey;
  await act(() => hook.current().handleCreate(INPUT));
  assert.deepEqual({ calls, key: hook.current().createFormKey, count: hook.current().projects.length }, { calls: [], key, count: 2 });

  const missing = mutationsHarness(t, undefined);
  await assert.rejects(missing.hook.current().handleCreate(INPUT), /Runner desktop connection required to create a website\./);
  await assert.rejects(missing.hook.current().handleDelete('a'), /Runner desktop connection required to delete a website\./);
  assert.deepEqual(missing.calls, []);
  assert.equal(missing.hook.current().projects.length, 2);
});

test('useProjectMutations: delete drops the row and its tab; open clears the notice first; cancel resets the form', async (t) => {
  const deleted: string[] = [];
  const { hook, calls } = mutationsHarness(t, { createSite: async () => CREATED, deleteSite: async (id) => { deleted.push(id); } });
  await act(() => hook.current().handleDelete('a'));
  assert.deepEqual(deleted, ['a']);
  assert.deepEqual(hook.current().projects.map((p) => p.id), ['b']);
  assert.deepEqual(calls.splice(0), ['close:a']);

  await act(() => hook.current().handleCreate(INPUT));
  assert.equal(hook.current().lastCreated, CREATED);
  calls.length = 0;
  const key = hook.current().createFormKey;
  act(() => hook.current().openCreateWebsite());
  assert.equal(hook.current().lastCreated, null);
  assert.equal(hook.current().createFormKey, key + 1);
  assert.deepEqual(calls.splice(0), ['start']);
  act(() => hook.current().cancelCreate());
  assert.equal(hook.current().createFormKey, key + 2);
  assert.deepEqual(calls, ['stop']);
});

test('useProjectMutations: the ready notice is withdrawn once the created site starts', async (t) => {
  const { hook } = mutationsHarness(t, { createSite: async () => CREATED, deleteSite: async () => {} });
  await act(() => hook.current().handleCreate(INPUT));
  assert.equal(hook.current().lastCreated, CREATED, 'still true: the new site is stopped and on the grid');
  const apply = renderHook(t, () => null);
  void apply;
  await act(() => hook.current().handleDelete('new'));
  assert.equal(hook.current().lastCreated, null, 'the site it names is gone, so the notice goes too');
});

// ── useExpandedMode ─────────────────────────────────────────────────────────────────────────────

test('useExpandedMode: toggles, collapses on Escape only, and never outlives the workspace it immerses', (t) => {
  let showSiteTab = true;
  const hook = renderHook(t, () => useExpandedMode(showSiteTab));
  const press = (key: string) => act(() => { window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key })); });
  assert.equal(hook.current().expanded, false);
  act(() => hook.current().toggleExpanded());
  assert.equal(hook.current().expanded, true);
  press('a');
  assert.equal(hook.current().expanded, true);
  press('Escape');
  assert.equal(hook.current().expanded, false);
  act(() => hook.current().toggleExpanded());
  showSiteTab = false;
  hook.rerender();
  assert.equal(hook.current().expanded, false);
});

// ── useDismissibleDropdown, useMenuKeyboard ─────────────────────────────────────────────────────

test('useDismissibleDropdown: outside pointerdown and Escape close it; a press inside does not', (t) => {
  const hook = renderHook(t, () => useDismissibleDropdown<HTMLDivElement>(),
    (value) => createElement('div', { ref: value.containerRef }, createElement('button', { id: 'inside' })));
  const pointer = (target: Element) => act(() => { target.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })); });
  act(() => hook.current().setOpen(true));
  pointer(document.getElementById('inside')!);
  assert.equal(hook.current().open, true);
  pointer(document.body);
  assert.equal(hook.current().open, false);
  act(() => hook.current().setOpen(true));
  act(() => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); });
  assert.equal(hook.current().open, false);
});

function menuHarness(t: TestContext) {
  let open = false;
  const hook = renderHook(t, () => useMenuKeyboard<HTMLDivElement, HTMLButtonElement>({ open }), (value) => createElement('div', null,
    createElement('button', { id: 'trigger', ref: value.triggerRef }),
    createElement('button', { id: 'elsewhere' }),
    open ? createElement('div', { role: 'menu', ref: value.menuRef },
      createElement('button', { role: 'menuitem', id: 'one' }),
      createElement('button', { role: 'menuitemradio', id: 'two' }),
      createElement('button', { role: 'menuitem', id: 'three' })) : null));
  const setOpen = (next: boolean) => { open = next; hook.rerender(); };
  const key = (name: string) => {
    let prevented = false;
    hook.current().onMenuKeyDown({ key: name, preventDefault: () => { prevented = true; } } as never);
    return prevented;
  };
  return { setOpen, key, focused: () => document.activeElement?.id };
}

test('useMenuKeyboard: opening focuses the first entry and the arrows, Home and End move between entries', (t) => {
  const menu = menuHarness(t);
  menu.setOpen(true);
  assert.equal(menu.focused(), 'one');
  assert.equal(menu.key('ArrowDown'), true);
  assert.equal(menu.focused(), 'two');
  menu.key('End');
  assert.equal(menu.focused(), 'three');
  menu.key('ArrowDown');
  assert.equal(menu.focused(), 'one');
  menu.key('ArrowUp');
  assert.equal(menu.focused(), 'three');
  menu.key('Home');
  assert.equal(menu.focused(), 'one');
  assert.equal(menu.key('a'), false, 'a key that is not menu navigation is left alone');
  assert.equal(menu.focused(), 'one');
});

test('useMenuKeyboard: closing with focus inside (or nowhere) returns it to the trigger; a deliberate click away is left alone', (t) => {
  const menu = menuHarness(t);
  menu.setOpen(true);
  menu.setOpen(false);
  assert.equal(menu.focused(), 'trigger');
  assert.equal(menu.key('ArrowDown'), false, 'with no menu mounted there is nothing to move to');

  menu.setOpen(true);
  (document.activeElement as HTMLElement).blur();
  assert.equal(document.activeElement, document.body);
  menu.setOpen(false);
  assert.equal(menu.focused(), 'trigger');

  menu.setOpen(true);
  (document.getElementById('elsewhere') as HTMLElement).focus();
  menu.setOpen(false);
  assert.equal(menu.focused(), 'elsewhere');
});

// ── useDeleteConfirmation ───────────────────────────────────────────────────────────────────────

test('useDeleteConfirmation: request, Escape cancels unless a delete is in flight, success clears, failure explains', async (t) => {
  const outcomes: Promise<void>[] = [];
  const hook = renderHook(t, () => useDeleteConfirmation(() => outcomes.shift()!));
  const escape = () => act(() => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); });
  act(() => hook.current().requestDelete('a'));
  assert.equal(hook.current().pendingId, 'a');
  escape();
  assert.equal(hook.current().pendingId, null);

  act(() => hook.current().requestDelete('a'));
  const slow = deferred<void>();
  outcomes.push(slow.promise);
  let done!: Promise<void>;
  act(() => { done = hook.current().confirmDelete('a'); });
  assert.equal(hook.current().deletingId, 'a');
  escape();
  assert.equal(hook.current().pendingId, 'a', 'Escape cannot cancel a delete that is already running');
  slow.resolve();
  await act(() => done);
  assert.deepEqual([hook.current().pendingId, hook.current().deletingId, hook.current().deleteError], [null, null, null]);

  act(() => hook.current().requestDelete('b'));
  outcomes.push(Promise.reject(new Error("Error invoking remote method 'site:delete': Error: folder is locked")));
  await act(() => hook.current().confirmDelete('b'));
  assert.equal(hook.current().deleteError, 'folder is locked');
  assert.equal(hook.current().pendingId, 'b', 'the card stays so the operator can retry');
  act(() => hook.current().cancelDelete());
  act(() => hook.current().requestDelete('b'));
  assert.equal(hook.current().deleteError, null, 'a new request starts without the old error');
});

// ── useSiteStart ────────────────────────────────────────────────────────────────────────────────

test('useSiteStart: success hands main\'s record on and resolves true; a missing bridge or a rejection resolves false with a reason', async (t) => {
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

// ── useWebviewLoadFailure ───────────────────────────────────────────────────────────────────────

function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    pending,
    timers: {
      setTimeout: ((callback: () => void, ms: number) => { assert.equal(ms, 8000); pending.set(next, callback); return next++; }) as unknown as Window['setTimeout'],
      clearTimeout: ((handle: number) => { pending.delete(handle); }) as Window['clearTimeout'],
    },
    fireAll: () => { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(); },
  };
}

function loadEvent(type: string, fields: Record<string, unknown> = {}) {
  return Object.assign(new dom.window.Event(type), fields);
}

test('useWebviewLoadFailure: ignores sub-frame and aborted failures, reports a real one, and a finished load clears both', (t) => {
  const clock = fakeTimers();
  let resetKey = 0;
  const hook = renderHook(t, () => useWebviewLoadFailure(resetKey, { timers: clock.timers }));
  const guest = document.createElement('div') as unknown as HTMLWebViewElement;
  assert.equal(clock.pending.size, 0, 'no guest, no stall timer');
  act(() => hook.current().guestRef(guest));
  assert.equal(hook.current().guest, guest);
  assert.equal(clock.pending.size, 1);
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: false, errorCode: -105 })); });
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -3 })); });
  assert.deepEqual([hook.current().failed, hook.current().stalled, hook.current().loaded], [false, false, false]);
  act(() => clock.fireAll());
  assert.equal(hook.current().stalled, true);
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -102 })); });
  assert.deepEqual([hook.current().failed, hook.current().stalled], [true, false], 'a fact withdraws the guess');

  resetKey = 1;
  hook.rerender();
  assert.deepEqual([hook.current().failed, hook.current().stalled, hook.current().loaded], [false, false, false]);
  assert.equal(clock.pending.size, 1, 'the reset re-arms one fresh stall timer');
  act(() => { guest.dispatchEvent(loadEvent('did-finish-load')); });
  assert.deepEqual([hook.current().failed, hook.current().stalled, hook.current().loaded], [false, false, true]);
  assert.equal(clock.pending.size, 0);

  act(() => hook.current().guestRef(null));
  act(() => { guest.dispatchEvent(loadEvent('did-fail-load', { isMainFrame: true, errorCode: -102 })); });
  assert.equal(hook.current().failed, false, 'a detached guest is no longer listened to');
});

test('useWebviewLoadFailure: unmounting clears a pending stall timer', (t) => {
  const clock = fakeTimers();
  const hook = renderHook(t, () => useWebviewLoadFailure('k', { timers: clock.timers }));
  act(() => hook.current().guestRef(document.createElement('div') as unknown as HTMLWebViewElement));
  assert.equal(clock.pending.size, 1);
  hook.unmount();
  assert.equal(clock.pending.size, 0);
});

// ── useWorkspaceChatTransport ───────────────────────────────────────────────────────────────────

/** A full bridge with inert defaults; tests override only what they exercise. */
function fakeBridge(overrides: Partial<RunnerInventoryBridge> = {}): RunnerInventoryBridge & { chatListeners: Set<unknown> } {
  const chatListeners = new Set<unknown>();
  const inert = async () => { throw new Error('not used by this test'); };
  return {
    chatListeners,
    listAgents: async () => [], rescanAgents: async () => [], daemonOnline: async () => true,
    listSites: async () => [], rescanSites: async () => [], addSite: inert, createSite: inert, renameSite: inert,
    getSitePreview: async () => null, locateSite: inert, startSite: inert, stopSite: inert, deleteSite: inert,
    openSiteExternal: inert, chatStart: inert, chatReattach: inert, chatDetach: async () => {}, chatStop: inert, chatStatus: async () => null,
    saveChatAttachment: async () => ({ path: '/staged/file.txt' }) as never,
    listConversations: async () => [], createConversation: inert, renameConversation: inert, deleteConversation: inert,
    loadConversationMessages: async () => [], saveConversationMessage: async () => {},
    onChatEvent: (listener) => { chatListeners.add(listener); return () => chatListeners.delete(listener); },
    onNavigate: () => () => {}, onSiteHistory: () => () => {}, onFindToggle: () => () => {},
    findInPage: async () => {}, stopFindInPage: async () => {}, onFindResult: () => () => {}, onZoomCommand: () => () => {},
    getZoomLevel: () => 0, setZoomLevel: () => {}, getPathForFile: () => '/picked/file.txt',
    pickWorkingDirectory: async () => null, recentWorkingDirectories: async () => [], workingDirectoryExists: async () => true,
    normalizeWorkingDirectory: async (directory) => directory,
    ...overrides,
  };
}

test('useWorkspaceChatTransport: wires every surface from one bridge, and disposing the pane drops its run listener', (t) => {
  const bridge = fakeBridge();
  const getBridge = () => bridge;
  const hook = renderHook(t, () => useWorkspaceChatTransport({}, { getBridge }));
  const value = hook.current();
  assert.deepEqual(value.runtimeAccess, { listAgents: bridge.listAgents, rescanAgents: bridge.rescanAgents, daemonOnline: bridge.daemonOnline });
  assert.deepEqual(value.workingDirectoryAccess, {
    normalizeWorkingDirectory: bridge.normalizeWorkingDirectory, pickWorkingDirectory: bridge.pickWorkingDirectory,
    recentDirectories: bridge.recentWorkingDirectories, directoryExists: bridge.workingDirectoryExists,
  });
  assert.equal(value.getPathForFile, bridge.getPathForFile);
  assert.equal(typeof value.uploadAttachments, 'function');
  assert.ok(value.transport);
  assert.equal(bridge.chatListeners.size, 1, 'one run-event listener per pane');
  hook.rerender();
  assert.equal(hook.current().transport, value.transport, 'the transport is not rebuilt per render');
  assert.equal(bridge.chatListeners.size, 1);
  hook.unmount();
  assert.equal(bridge.chatListeners.size, 0);
});

test('useWorkspaceChatTransport: without a bridge every surface is absent', (t) => {
  const getBridge = () => undefined;
  const hook = renderHook(t, () => useWorkspaceChatTransport({}, { getBridge }));
  assert.deepEqual(hook.current(), { transport: undefined, runtimeAccess: undefined, workingDirectoryAccess: undefined, getPathForFile: undefined, uploadAttachments: undefined });
});

// ── useRunnerConversations ──────────────────────────────────────────────────────────────────────

function convo(id: string, title: string | null = id): WorkspaceConversationSummary {
  return { id, title } as WorkspaceConversationSummary;
}

function message(id: string, role: 'user' | 'assistant' = 'user', runStatus?: string): ChatMessage {
  return { id, role, ...(runStatus ? { runStatus } : {}) } as unknown as ChatMessage;
}

/** A conversation store fake: a list, per-conversation transcripts, and a record of every write. */
function conversationStore(initial: WorkspaceConversationSummary[] = []) {
  const state = { list: [...initial], saved: [] as string[], created: 0, deleted: [] as string[], renamed: [] as string[] };
  const bridge = {
    listConversations: async () => [...state.list],
    loadConversationMessages: async (id: string) => [message(`${id}-m1`)],
    createConversation: async () => { state.created++; const made = convo(`c${state.created}`); state.list.unshift(made); return made; },
    deleteConversation: async (id: string) => { state.deleted.push(id); state.list = state.list.filter((c) => c.id !== id); },
    renameConversation: async ({ id, title }: { id: string; title: string }) => { state.renamed.push(`${id}=${title}`); },
    saveConversationMessage: async ({ conversationId, message: saved }: { conversationId: string; message: ChatMessage }) => { state.saved.push(`${conversationId}/${saved.id}`); },
  };
  return { state, bridge };
}

function renderConversations(t: TestContext, bridge: Partial<ReturnType<typeof conversationStore>['bridge']> | undefined) {
  const getBridge = () => bridge as never;
  return renderHook(t, () => useRunnerConversations({}, { getBridge }));
}

/** Silences the hook's own console.error and counts what it logged. */
function quietErrors(t: TestContext) {
  const spy = t.mock.method(console, 'error', () => {});
  return { get length() { return spy.mock.callCount(); } };
}

test('useRunnerConversations: loads the list on mount, and a failed load logs and keeps an empty switcher', async (t) => {
  const { bridge } = conversationStore([convo('a'), convo('b')]);
  const hook = renderConversations(t, bridge);
  await settle();
  assert.deepEqual(hook.current().conversations.map((c) => c.id), ['a', 'b']);
  assert.deepEqual([hook.current().activeId, hook.current().paneKey], [null, 'new']);

  const errors = quietErrors(t);
  const failing = renderConversations(t, { ...bridge, listConversations: () => Promise.reject(new Error('db locked')) });
  await settle();
  assert.deepEqual(failing.current().conversations, []);
  assert.equal(errors.length, 1);
});

test('useRunnerConversations: select loads a transcript, a slower earlier select never lands, and a failed load still switches', async (t) => {
  const { bridge } = conversationStore([convo('a'), convo('b')]);
  const slow = deferred<ChatMessage[]>();
  const errors = quietErrors(t);
  const hook = renderConversations(t, {
    ...bridge,
    loadConversationMessages: (id: string) => (id === 'a' ? slow.promise : id === 'bad' ? Promise.reject(new Error('gone')) : bridge.loadConversationMessages(id)),
  });
  await settle();
  act(() => hook.current().select('a'));
  act(() => hook.current().select('b'));
  await settle();
  slow.resolve([message('a-late')]);
  await settle();
  assert.deepEqual([hook.current().activeId, hook.current().paneKey], ['b', 'b']);
  assert.deepEqual(hook.current().initialMessages.map((m) => m.id), ['b-m1']);

  act(() => hook.current().select('bad'));
  await settle();
  assert.deepEqual([hook.current().activeId, hook.current().initialMessages], ['bad', []]);
  assert.equal(errors.length, 1);
});

test('useRunnerConversations: create switches to the new thread unless a select overtook it while it was in flight', async (t) => {
  const { bridge, state } = conversationStore([convo('a')]);
  const hook = renderConversations(t, bridge);
  await settle();
  await act(() => hook.current().create());
  assert.deepEqual([hook.current().activeId, hook.current().paneKey, hook.current().initialMessages], ['c1', 'c1', []]);
  assert.equal(hook.current().conversations[0]!.id, 'c1');

  const gate = deferred<void>();
  const raced = renderConversations(t, { ...bridge, createConversation: async () => { await gate.promise; return bridge.createConversation(); } });
  await settle();
  let creating!: Promise<void>;
  act(() => { creating = raced.current().create(); });
  act(() => raced.current().select('a'));
  await settle();
  gate.resolve();
  await act(() => creating);
  assert.equal(raced.current().activeId, 'a', 'the later selection wins');
  assert.equal(raced.current().conversations[0]!.id, 'c2', 'the created row still shows in the switcher');
  assert.equal(state.created, 2);
});

test('useRunnerConversations: removing the open thread lands on the next one, or on a fresh pane when none is left', async (t) => {
  const { bridge, state } = conversationStore([convo('a'), convo('b')]);
  const hook = renderConversations(t, bridge);
  await settle();
  act(() => hook.current().select('a'));
  await settle();
  await act(() => hook.current().remove('b'));
  assert.deepEqual(state.deleted, ['b']);
  assert.equal(hook.current().activeId, 'a', 'removing another thread leaves the open one alone');

  state.list.push(convo('z'));
  await act(() => hook.current().remove('a'));
  await settle();
  assert.deepEqual([hook.current().activeId, hook.current().paneKey], ['z', 'z']);

  await act(() => hook.current().remove('z'));
  assert.deepEqual([hook.current().activeId, hook.current().paneKey, hook.current().initialMessages], [null, 'new-1', []]);
  assert.deepEqual(hook.current().conversations, []);
});

test('useRunnerConversations: a remove whose refresh fails falls back to the list already on screen', async (t) => {
  const { bridge } = conversationStore([convo('a'), convo('b')]);
  let failLists = false;
  const errors = quietErrors(t);
  const hook = renderConversations(t, { ...bridge, listConversations: () => (failLists ? Promise.reject(new Error('db locked')) : bridge.listConversations()) });
  await settle();
  act(() => hook.current().select('a'));
  await settle();
  failLists = true;
  await act(() => hook.current().remove('a'));
  await settle();
  assert.equal(hook.current().activeId, 'a', 'the stale on-screen list still names a as first, so a is reselected');
  assert.equal(errors.length, 1);
});

test('useRunnerConversations: rename is optimistic, logs a failed write, and re-reads the list either way', async (t) => {
  const { bridge, state } = conversationStore([convo('a', 'Old')]);
  const hook = renderConversations(t, { ...bridge, listConversations: async () => state.list.map((c) => ({ ...c, title: `${c.title}!` })) });
  await settle();
  let renaming!: Promise<void>;
  assert.equal(hook.current().conversations[0]!.title, 'Old!');
  act(() => { renaming = hook.current().rename('a', 'New'); });
  assert.equal(hook.current().conversations[0]!.title, 'New', 'the new title shows before the round trip');
  await act(() => renaming);
  await settle();
  assert.deepEqual(state.renamed, ['a=New']);
  assert.equal(hook.current().conversations[0]!.title, 'Old!', 'then the list is re-read from the store');

  const errors = quietErrors(t);
  const failing = renderConversations(t, { ...bridge, renameConversation: () => Promise.reject(new Error('read-only')) });
  await settle();
  let failed!: Promise<void>;
  act(() => { failed = failing.current().rename('a', 'Draft'); });
  assert.equal(failing.current().conversations[0]!.title, 'Draft', 'the new title shows before the round trip');
  await act(() => failed);
  await settle();
  assert.equal(failing.current().conversations[0]!.title, 'Old', 'the re-read restores what the store kept');
  assert.equal(errors.length, 1);
});

test('useRunnerConversations: an open thread saves each settled message once, and a failed save is retried later', async (t) => {
  const { bridge, state } = conversationStore([convo('a')]);
  let failNext = false;
  const errors = quietErrors(t);
  const hook = renderConversations(t, {
    ...bridge,
    saveConversationMessage: (input: { conversationId: string; message: ChatMessage }) => {
      if (failNext) { failNext = false; return Promise.reject(new Error('disk full')); }
      return bridge.saveConversationMessage(input);
    },
  });
  await settle();
  act(() => hook.current().select('a'));
  await settle();
  act(() => hook.current().onMessagesChange([message('a-m1'), message('u1'), message('r1', 'assistant', 'running')]));
  await settle();
  assert.deepEqual(state.saved, ['a/u1'], 'the loaded transcript and a still-streaming reply are not saved');
  act(() => hook.current().onMessagesChange([message('a-m1'), message('u1')]));
  await settle();
  assert.deepEqual(state.saved, ['a/u1'], 'nothing new, nothing written');
  failNext = true;
  act(() => hook.current().onMessagesChange([message('u1'), message('u2')]));
  await settle();
  assert.equal(errors.length, 1);
  act(() => hook.current().onMessagesChange([message('u1'), message('u2')]));
  await settle();
  assert.deepEqual(state.saved, ['a/u1', 'a/u2']);
});

test('useRunnerConversations: a first message with nothing open adopts exactly one new thread and saves into it', async (t) => {
  const { bridge, state } = conversationStore();
  const gate = deferred<void>();
  const hook = renderConversations(t, { ...bridge, createConversation: async () => { await gate.promise; return bridge.createConversation(); } });
  await settle();
  act(() => hook.current().onMessagesChange([]));
  act(() => hook.current().onMessagesChange([message('r0', 'assistant', 'running')]));
  assert.equal(state.created, 0, 'the mount echo and a streaming reply are not worth a thread');
  act(() => hook.current().onMessagesChange([message('u1')]));
  act(() => hook.current().onMessagesChange([message('u1'), message('u2')]));
  gate.resolve();
  await settle();
  assert.equal(state.created, 1);
  assert.equal(hook.current().activeId, 'c1');
  assert.equal(hook.current().paneKey, 'new', 'adopting mid-turn never remounts the pane');
  assert.deepEqual(state.saved.sort(), ['c1/u1', 'c1/u2']);
});

test('useRunnerConversations: an adoption overtaken by a select still saves its messages but does not take over', async (t) => {
  const { bridge, state } = conversationStore([convo('a')]);
  const gate = deferred<void>();
  const hook = renderConversations(t, { ...bridge, createConversation: async () => { await gate.promise; return bridge.createConversation(); } });
  await settle();
  act(() => hook.current().onMessagesChange([message('u1')]));
  act(() => hook.current().select('a'));
  await settle();
  gate.resolve();
  await settle();
  assert.equal(hook.current().activeId, 'a');
  assert.deepEqual(state.saved, ['c1/u1']);
});

test('useRunnerConversations: a failed adoption logs and lets the next message try again', async (t) => {
  const { bridge, state } = conversationStore();
  let failCreate = true;
  const errors = quietErrors(t);
  const hook = renderConversations(t, { ...bridge, createConversation: () => (failCreate ? Promise.reject(new Error('db locked')) : bridge.createConversation()) });
  await settle();
  act(() => hook.current().onMessagesChange([message('u1')]));
  await settle();
  assert.deepEqual([hook.current().activeId, state.saved, errors.length], [null, [], 1]);
  failCreate = false;
  act(() => hook.current().onMessagesChange([message('u1')]));
  await settle();
  assert.equal(hook.current().activeId, 'c1');
  assert.deepEqual(state.saved, ['c1/u1']);
});

test('useRunnerConversations: a message landing between deleting the open thread and loading the next is still written', async (t) => {
  const { bridge, state } = conversationStore([convo('a'), convo('b')]);
  const nextLoad = deferred<ChatMessage[]>();
  const hook = renderConversations(t, { ...bridge, loadConversationMessages: (id: string) => (id === 'b' ? nextLoad.promise : bridge.loadConversationMessages(id)) });
  await settle();
  act(() => hook.current().select('a'));
  await settle();
  await act(() => hook.current().remove('a'));
  act(() => hook.current().onMessagesChange([message('late')]));
  await settle();
  assert.deepEqual(state.saved, ['a/late']);
  nextLoad.resolve([]);
  await settle();
  assert.equal(hook.current().activeId, 'b');
});

test('useRunnerConversations: without a bridge every action is a no-op', async (t) => {
  const hook = renderConversations(t, undefined);
  act(() => hook.current().select('a'));
  await act(() => hook.current().create());
  await act(() => hook.current().remove('a'));
  await act(() => hook.current().rename('a', 'x'));
  act(() => hook.current().onMessagesChange([message('u1')]));
  await settle();
  assert.deepEqual([hook.current().conversations, hook.current().activeId, hook.current().paneKey], [[], null, 'new']);
});

// ── useConversationDeleteConfirmation ───────────────────────────────────────────────────────────

test('useConversationDeleteConfirmation: a prompt resolves from the answer, and a newer prompt cancels an older one', async (t) => {
  const hook = renderHook(t, () => useConversationDeleteConfirmation());
  act(() => hook.current().resolvePending(true));
  assert.equal(hook.current().pendingTitle, null, 'answering with nothing pending is a no-op');
  let first!: Promise<boolean>;
  act(() => { first = hook.current().confirmDelete({ id: 'a', title: null } as never); });
  assert.equal(hook.current().pendingTitle, 'Untitled');
  let second!: Promise<boolean>;
  act(() => { second = hook.current().confirmDelete({ id: 'b', title: 'Deploy notes' } as never); });
  assert.equal(await first, false);
  assert.equal(hook.current().pendingTitle, 'Deploy notes');
  act(() => hook.current().resolvePending(true));
  assert.equal(await second, true);
  assert.equal(hook.current().pendingTitle, null);
});

// ── useCreateWebsiteForm ────────────────────────────────────────────────────────────────────────

function formHarness(t: TestContext, onCreate: (input: CreateSiteInput) => Promise<void>, { withInputs = true } = {}) {
  const hook = renderHook(t, () => useCreateWebsiteForm(onCreate), (form) => (withInputs ? createElement('div', null,
    createElement('input', { id: 'supabase-key', ref: form.supabaseKeyRef }),
    createElement('input', { id: 'custom-credential', ref: form.customCredentialRef })) : null));
  const submit = () => {
    let prevented = 0;
    act(() => { void hook.current().handleSubmit({ preventDefault: () => { prevented++; } } as never); });
    return prevented;
  };
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  return { hook, submit, field };
}

test('useCreateWebsiteForm: an invalid name explains itself on submit and an empty one never enables Create', async (t) => {
  const created: CreateSiteInput[] = [];
  const { hook, submit } = formHarness(t, async (input) => { created.push(input); });
  assert.deepEqual([hook.current().canCreate, hook.current().nameError], [false, null]);
  assert.equal(submit(), 1);
  assert.equal(hook.current().formError, SITE_NAME_ERROR);
  act(() => hook.current().setName('   '));
  assert.equal(hook.current().nameError, SITE_NAME_ERROR);
  act(() => hook.current().setName('!!!'));
  assert.deepEqual([hook.current().slug, hook.current().canCreate], ['', false]);
  submit();
  await settle();
  assert.deepEqual(created, [], 'a name with no letters or digits cannot be created');
});

test('useCreateWebsiteForm: Supabase needs a URL and a typed key; the key is read once and wiped before the call', async (t) => {
  const created: CreateSiteInput[] = [];
  const pending = deferred<void>();
  const { hook, submit, field } = formHarness(t, async (input) => { created.push(input); await pending.promise; });
  act(() => { hook.current().setName('Café Münster'); hook.current().setDatabase('supabase'); });
  assert.equal(hook.current().canCreate, false);
  act(() => hook.current().setSupabaseUrl(' https://db.example '));
  assert.equal(hook.current().canCreate, false, 'a URL without a key is not ready');
  field('supabase-key').value = 'secret-from-dom';
  act(() => hook.current().setHasSupabaseKey(true));
  assert.equal(hook.current().canCreate, true);
  submit();
  assert.equal(hook.current().isSubmitting, true);
  assert.equal(field('supabase-key').value, '', 'the DOM gives the secret up before the request starts');
  submit();
  pending.resolve();
  await settle();
  assert.equal(created.length, 1, 'a second submit while one is running is ignored');
  assert.deepEqual(created[0]!.database, { kind: 'supabase', endpoint: 'https://db.example', credential: 'secret-from-dom' });
  assert.equal(hook.current().isSubmitting, false);
});

test('useCreateWebsiteForm: a custom provider needs a label and a connection; a failed create shows the reason', async (t) => {
  const { hook, submit, field } = formHarness(t, async () => { throw new Error("Error invoking remote method 'site:create': Error: folder exists"); });
  act(() => { hook.current().setName('Shop'); hook.current().setDatabase('custom'); hook.current().setCustomProvider('Neon'); });
  assert.equal(hook.current().canCreate, false);
  act(() => { hook.current().setCustomConnection('postgres://db'); hook.current().setHasCustomCredential(true); });
  assert.equal(hook.current().canCreate, true);
  field('custom-credential').value = 'custom-from-dom';
  submit();
  await settle();
  assert.equal(field('custom-credential').value, '');
  assert.equal(hook.current().formError, 'folder exists');
  assert.equal(hook.current().isSubmitting, false);
});

test('useCreateWebsiteForm: with the credential inputs unmounted a SQLite site still submits with no credential', async (t) => {
  const created: CreateSiteInput[] = [];
  const { hook, submit } = formHarness(t, async (input) => { created.push(input); }, { withInputs: false });
  act(() => hook.current().setName('Blog'));
  submit();
  await settle();
  assert.deepEqual(created, [{ displayName: 'Blog', database: { kind: 'sqlite' } }]);
  assert.equal(hook.current().formError, null);
});
