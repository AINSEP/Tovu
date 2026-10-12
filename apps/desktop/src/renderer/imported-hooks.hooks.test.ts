/**
 * The three settings/version hooks rendered from their real modules under jsdom, so the coverage
 * gate has a record for them. Their sibling tests (`use-app-version.hooks.test.ts`,
 * `use-site-folders.hooks.test.ts`) evaluate the hook SOURCE through `sourceFunction`, which lcov
 * cannot attribute to the file. Ports are injected (bridge, action hook, folders hook); no module mocks.
 * The default action hook (Jini's useAsyncAction) is not rendered here: in a dev tree Jini is linked
 * and brings its own React copy, so its hooks see a null dispatcher.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SiteFolders } from '../contracts/project.js';
import { useAppVersion } from './use-app-version.hooks.js';
import { useSiteFolders, type SiteFoldersSettings } from './use-site-folders.hooks.js';
import { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';

type TestContext = { after: (fn: () => void) => void };

// One jsdom for the whole file: node --test runs each test file in its own process.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });

/** Render `useHook` into its own jsdom root; `current()` is the latest return value. */
function renderHook<T>(t: TestContext, useHook: () => T) {
  let latest: T;
  function Probe() { latest = useHook(); return null; }
  const root = createRoot(dom.window.document.body.appendChild(dom.window.document.createElement('div')));
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; act(() => root.unmount()); } };
  t.after(unmount);
  act(() => root.render(createElement(Probe)));
  return { current: () => latest!, rerender: () => act(() => root.render(createElement(Probe))), unmount };
}

const settle = () => act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });

/** The action-hook port: the same {saving, error, setError, run} contract as Jini's useAsyncAction. */
function useFakeAction() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async ({ action, describeError }: { action: () => Promise<void>; describeError: (failure: unknown) => string }) => {
    setSaving(true); setError(null);
    try { await action(); } catch (failure) { setError(describeError(failure)); } finally { setSaving(false); }
  };
  return { saving, error, setError, run } as unknown as ReturnType<NonNullable<Parameters<typeof useSiteFolders>[1]>['useAction'] & {}>;
}

test('useAppVersion: loads the version, keeps a failure message, and waits without a bridge', async (t) => {
  const ok = renderHook(t, () => useAppVersion({}, { bridge: okBridge }));
  assert.deepEqual(ok.current(), { version: null, error: null });
  await settle();
  assert.deepEqual(ok.current(), { version: '0.1.14', error: null });

  const failing = renderHook(t, () => useAppVersion({}, { bridge: failBridge }));
  await settle();
  assert.deepEqual(failing.current(), { version: null, error: 'IPC down' });

  const thrown = renderHook(t, () => useAppVersion({}, { bridge: stringBridge }));
  await settle();
  assert.deepEqual(thrown.current(), { version: null, error: 'plain' });

  const emptyBridge = {};
  const missing = renderHook(t, () => useAppVersion({}, { bridge: emptyBridge }));
  await settle();
  assert.deepEqual(missing.current(), { version: null, error: null });

  // A reply after unmount is dropped.
  let resolveLate!: (version: string) => void;
  let rejectLate!: (error: Error) => void;
  const lateBridge = { getAppVersion: () => new Promise<string>((resolve) => { resolveLate = resolve; }) };
  const lateFailBridge = { getAppVersion: () => new Promise<string>((_resolve, reject) => { rejectLate = reject; }) };
  const late = renderHook(t, () => useAppVersion({}, { bridge: lateBridge }));
  const lateFail = renderHook(t, () => useAppVersion({}, { bridge: lateFailBridge }));
  late.unmount(); lateFail.unmount();
  resolveLate('9.9.9'); rejectLate(new Error('late'));
  await settle();
  assert.deepEqual(late.current(), { version: null, error: null });
  assert.deepEqual(lateFail.current(), { version: null, error: null });
});
const okBridge = { getAppVersion: async () => '0.1.14' };
const failBridge = { getAppVersion: async (): Promise<string> => { throw new Error('IPC down'); } };
const stringBridge = { getAppVersion: async (): Promise<string> => { throw 'plain'; } };

const FOLDERS: SiteFolders = { roots: ['/home'], extraRoots: ['/extra'], home: '/home', databases: 'inSite' };

function foldersBridge(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const bridge = {
    listSiteFolders: async () => FOLDERS,
    addSiteFolder: async () => { calls.push('add'); return { ...FOLDERS, extraRoots: ['/extra', '/added'] }; },
    removeSiteFolder: async ({ root }: { root: string }) => { calls.push(`remove ${root}`); return { ...FOLDERS, extraRoots: [] }; },
    setSitesHome: async () => { calls.push('home'); return { ...FOLDERS, home: '/new-home' }; },
    saveSiteSettings: async (patch: { databases: string }) => { calls.push(`save ${patch.databases}`); return { ...FOLDERS, databases: patch.databases as 'appData' }; },
    rescanSites: async () => { calls.push('rescan'); },
    ...overrides,
  };
  return { bridge, calls };
}

test('useSiteFolders: loads, applies every action result, and keeps a null picker result out', async (t) => {
  const { bridge, calls } = foldersBridge();
  const getBridge = () => bridge as never;
  const hook = renderHook(t, () => useSiteFolders({}, { getBridge, useAction: useFakeAction }));
  assert.equal(hook.current().busy, true);
  await settle();
  assert.deepEqual(hook.current().folders, FOLDERS);
  assert.equal(hook.current().busy, false);

  await act(() => hook.current().addFolder());
  assert.deepEqual(hook.current().folders.extraRoots, ['/extra', '/added']);
  await act(() => hook.current().removeFolder({ root: '/added' }));
  assert.deepEqual(hook.current().folders.extraRoots, []);
  await act(() => hook.current().setHome());
  assert.equal(hook.current().folders.home, '/new-home');
  await act(() => hook.current().saveSettings({ databases: 'appData' }));
  assert.equal(hook.current().folders.databases, 'appData');
  assert.deepEqual(calls, ['add', 'rescan', 'remove /added', 'home', 'save appData']);

  bridge.addSiteFolder = async () => null as never;
  await act(() => hook.current().addFolder());
  assert.equal(hook.current().folders.databases, 'appData', 'a cancelled picker leaves settings intact');
  assert.equal(calls.filter((call) => call === 'rescan').length, 1, 'a cancelled picker does not rescan');
});

test('useSiteFolders: a missing bridge or method and a failed load surface readable errors', async (t) => {
  const noBridge = () => undefined;
  const none = renderHook(t, () => useSiteFolders({}, { getBridge: noBridge, useAction: useFakeAction }));
  await settle();
  assert.equal(none.current().error, 'Sites folders settings are unavailable in this desktop version.');
  for (const [action, message] of [
    ['addFolder', 'Sites folders settings are unavailable in this desktop version.'],
    ['removeFolder', 'Sites folders settings are unavailable in this desktop version.'],
    ['setHome', 'Sites home settings are unavailable in this desktop version.'],
    ['saveSettings', 'Sites settings are unavailable in this desktop version.'],
  ] as const) {
    const run = none.current()[action] as (arg: never) => Promise<void>;
    await act(() => run((action === 'removeFolder' ? { root: '/x' } : { databases: 'inSite' }) as never));
    assert.equal(none.current().error, message);
  }
  act(() => none.current().clearError());
  assert.equal(none.current().error, null);

  const { bridge } = foldersBridge({ listSiteFolders: async () => { throw new Error("Error invoking remote method 'runner:sites:folders': Error: disk gone"); } });
  const getFailing = () => bridge as never;
  const failed = renderHook(t, () => useSiteFolders({}, { getBridge: getFailing, useAction: useFakeAction }));
  await settle();
  assert.equal(failed.current().error, 'disk gone');

  // Replies that land after unmount are dropped (both the success and the failure path).
  let resolveList!: (folders: SiteFolders) => void;
  let rejectList!: (error: Error) => void;
  const pendingOk = foldersBridge({ listSiteFolders: () => new Promise<SiteFolders>((resolve) => { resolveList = resolve; }) });
  const pendingFail = foldersBridge({ listSiteFolders: () => new Promise<SiteFolders>((_resolve, reject) => { rejectList = reject; }) });
  const getOk = () => pendingOk.bridge as never;
  const getFail = () => pendingFail.bridge as never;
  const a = renderHook(t, () => useSiteFolders({}, { getBridge: getOk, useAction: useFakeAction }));
  const b = renderHook(t, () => useSiteFolders({}, { getBridge: getFail, useAction: useFakeAction }));
  a.unmount(); b.unmount();
  resolveList(FOLDERS); rejectList(new Error('late'));
  await settle();
  assert.deepEqual(a.current().folders, { roots: [], extraRoots: [] });
  assert.equal(b.current().error, null);
});

test('useSiteStorageSettings: drafts follow the folders, the dialog clears errors, saves send placement', async (t) => {
  const calls: unknown[] = [];
  let folders: SiteFolders = { roots: [], extraRoots: ['/a', '/b'], home: '/h', databases: 'appData', warning: { provider: 'iCloud', message: 'synced', localHome: '/l' } };
  const settings = (): SiteFoldersSettings => ({
    folders, busy: false, error: 'boom',
    clearError: () => { calls.push('clear'); },
    addFolder: async () => {}, removeFolder: async () => {},
    setHome: async () => { calls.push('home'); },
    saveSettings: async (patch) => { calls.push(patch); },
  });
  const hook = renderHook(t, () => useSiteStorageSettings({}, { useFolders: settings }));
  assert.equal(hook.current().home, '/h');
  assert.equal(hook.current().roots, '/a\n/b');
  assert.equal(hook.current().databases, 'appData');
  assert.equal(hook.current().warningError, 'boom', 'a provider warning shows the error while the dialog is closed');

  act(() => hook.current().show());
  assert.equal(hook.current().open, true);
  assert.equal(hook.current().warningError, null);
  act(() => hook.current().close());
  assert.equal(hook.current().open, false);

  act(() => hook.current().setDatabases('inSite'));
  await act(() => hook.current().save());
  await act(() => hook.current().useAppData());
  await act(() => hook.current().useLocalHome());
  await act(() => hook.current().chooseHome());
  assert.deepEqual(calls, ['clear', 'clear', { databases: 'inSite' }, { databases: 'appData' }, 'home', 'home']);

  folders = { roots: [], extraRoots: [] };
  hook.rerender();
  assert.equal(hook.current().home, '');
  assert.equal(hook.current().roots, '');
  assert.equal(hook.current().databases, 'inSite');
  assert.equal(hook.current().warningError, null);
});
