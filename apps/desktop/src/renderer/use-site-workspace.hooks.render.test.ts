/**
 * @file `useSiteWorkspace` rendered from its real module under jsdom (see `dom-hook-harness.ts`),
 * with the bridge injected through its `getBridge` port and the real `useWebviewLoadFailure`. The
 * reducer, actions and subscriptions have direct tests in `use-site-workspace.hooks.test.ts`; this
 * file asserts what the hook composes: the guest `src`, the shown url, the foreign-site attach, and
 * the guest listeners and accelerator subscription following the guest that is actually mounted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { act } from 'react';

import type { SiteHistoryCommand, SiteRecord } from '../contracts/project.js';
import { installDom, renderHook, settle } from './dom-hook-harness.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { createWorkspaceActions, initialSiteWorkspaceState, prepareExternalWorkspace, useSiteWorkspace } from './use-site-workspace.hooks.js';

const OWN = { id: '/sites/a', installDir: '/sites/a', port: 4100, status: 'running' } as unknown as SiteRecord;
const FOREIGN = { ...OWN, id: '/outside/b', installDir: '/outside/b', port: 3456, externalUrl: 'https://localhost:3456/admin/' } as SiteRecord;

/** A bridge recording what the hook asks of it; `startSite` stays pending until the test settles it. */
function workspaceBridge() {
  const calls: string[] = [];
  const pending: { resolve: (record: SiteRecord) => void; reject: (error: unknown) => void }[] = [];
  const bridge = {
    startSite: (id: string) => {
      calls.push(`start:${id}`);
      return new Promise<SiteRecord>((resolve, reject) => { pending.push({ resolve, reject }); });
    },
    onSiteHistory: () => { calls.push('history'); return () => calls.push('history-off'); },
    openSiteExternal: async (input: { siteId: string; view: string }) => { calls.push(`external:${input.siteId}:${input.view}`); },
  } as unknown as RunnerInventoryBridge;
  return { getBridge: () => bridge, calls, next: () => pending.shift()! };
}

test('an own running site shows its admin at once and subscribes to history only while visible', async (t) => {
  const fake = workspaceBridge();
  let hidden = false;
  const hook = renderHook(t, () => useSiteWorkspace(OWN, hidden, { getBridge: fake.getBridge }));
  const workspace = hook.current();
  assert.equal(workspace.running, true);
  assert.equal(workspace.src, 'http://127.0.0.1:4100/admin/');
  assert.equal(workspace.displayUrl, workspace.src);
  assert.equal(workspace.surface, 'admin');
  assert.deepEqual(workspace.history, { canGoBack: false, canGoForward: false });
  assert.equal(workspace.attachError, null);
  assert.deepEqual(fake.calls, ['history'], 'an own site needs no attach');
  hidden = true;
  hook.rerender();
  assert.deepEqual(fake.calls, ['history', 'history-off']);
  act(() => hook.current().openInBrowser());
  await settle();
  assert.deepEqual(fake.calls.at(-1), 'external:/sites/a:admin');
});

test('a stopped site mounts no guest and shows no url', (t) => {
  const fake = workspaceBridge();
  const hook = renderHook(t, () => useSiteWorkspace({ ...OWN, status: 'stopped' }, false, { getBridge: fake.getBridge }));
  assert.equal(hook.current().running, false);
  assert.equal(hook.current().src, '');
  assert.equal(hook.current().displayUrl, '');
});

test('a foreign site mounts only once main has admitted its origin', async (t) => {
  const fake = workspaceBridge();
  const hook = renderHook(t, () => useSiteWorkspace(FOREIGN, false, { getBridge: fake.getBridge }));
  assert.equal(hook.current().src, '');
  assert.deepEqual(fake.calls.filter((call) => call.startsWith('start')), ['start:/outside/b']);
  fake.next().resolve({ ...FOREIGN, status: 'running' });
  await settle();
  assert.equal(hook.current().src, FOREIGN.externalUrl);
  assert.equal(hook.current().running, true);
});

test('a refused attach is shown on the tab; a settlement after unmount is dropped', async (t) => {
  const fake = workspaceBridge();
  const hook = renderHook(t, () => useSiteWorkspace(FOREIGN, false, { getBridge: fake.getBridge }));
  fake.next().reject(new Error('origin not allowed'));
  await settle();
  assert.equal(hook.current().attachError, 'origin not allowed');
  assert.equal(hook.current().src, '');

  const thrown = renderHook(t, () => useSiteWorkspace({ ...FOREIGN, id: '/outside/c' }, false, { getBridge: fake.getBridge }));
  fake.next().reject('plain refusal');
  await settle();
  assert.equal(thrown.current().attachError, 'plain refusal');

  const late = renderHook(t, () => useSiteWorkspace({ ...FOREIGN, id: '/outside/d' }, false, { getBridge: fake.getBridge }));
  const lateFail = renderHook(t, () => useSiteWorkspace({ ...FOREIGN, id: '/outside/e' }, false, { getBridge: fake.getBridge }));
  const admit = fake.next();
  const refuse = fake.next();
  late.unmount();
  lateFail.unmount();
  admit.resolve({ ...FOREIGN, id: '/outside/d' });
  refuse.reject(new Error('late'));
  await settle();
  assert.equal(late.current().src, '');
  assert.equal(lateFail.current().attachError, null);
});

test('prepareExternalWorkspace has nothing to attach for an own site', async () => {
  assert.equal(await prepareExternalWorkspace({ project: { id: OWN.id }, bridge: undefined }), null);
});

test('selecting the current view of a site with no address loads nothing', () => {
  const dispatched: unknown[] = [];
  const actions = createWorkspaceActions({
    guest: null, failed: false, stalled: false,
    state: { ...initialSiteWorkspaceState, view: 'admin', liveUrl: 'http://127.0.0.1:4100/about' },
    dispatch: (action) => void dispatched.push(action),
    bridge: undefined, siteId: OWN.id, port: 0,
  });
  actions.selectView('admin');
  assert.deepEqual(dispatched, [{ type: 'select-view', view: 'admin' }], 'no load and no remount for a portless site');
});

test('an attached guest reports its history and navigations into the workspace', (t) => {
  const fake = workspaceBridge();
  const hook = renderHook(t, () => useSiteWorkspace(OWN, false, { getBridge: fake.getBridge }));
  const window = installDom();
  let canGoBack = false;
  const guest = Object.assign(window.document.createElement('webview'), {
    canGoBack: () => canGoBack,
    canGoForward: () => false,
  }) as unknown as HTMLWebViewElement;
  act(() => hook.current().guestRef(guest));
  assert.deepEqual(hook.current().history, { canGoBack: false, canGoForward: false });
  canGoBack = true;
  act(() => { guest.dispatchEvent(Object.assign(new window.Event('did-navigate'), { url: 'http://127.0.0.1:4100/admin/posts' })); });
  assert.deepEqual(hook.current().history, { canGoBack: true, canGoForward: false });
  assert.equal(hook.current().displayUrl, 'http://127.0.0.1:4100/admin/posts');
  act(() => hook.current().guestRef(null));
  assert.deepEqual(hook.current().history, { canGoBack: false, canGoForward: false }, 'a detached guest has no history');
});

test('a replacement guest takes over the navigation listeners and the visible tab\'s accelerator; unmounting detaches both', (t) => {
  const window = installDom();
  const commands = new Set<(command: SiteHistoryCommand) => void>();
  const bridge = {
    onSiteHistory: (listener: (command: SiteHistoryCommand) => void) => { commands.add(listener); return () => { commands.delete(listener); }; },
  } as unknown as RunnerInventoryBridge;
  /** A guest with fixed history that records its steps and counts its live navigation listeners. */
  function recordingGuest(history: { canGoBack: boolean; canGoForward: boolean }) {
    const node = window.document.createElement('webview');
    const add = node.addEventListener.bind(node);
    const remove = node.removeEventListener.bind(node);
    const navigation = new Set<unknown>();
    const steps: string[] = [];
    const isNavigation = (type: string) => type === 'did-navigate' || type === 'did-navigate-in-page';
    Object.assign(node, {
      canGoBack: () => history.canGoBack,
      canGoForward: () => history.canGoForward,
      goBack: () => { steps.push('back'); },
      goForward: () => { steps.push('forward'); },
      addEventListener: (type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => {
        if (isNavigation(type)) navigation.add(listener);
        add(type, listener, options);
      },
      removeEventListener: (type: string, listener: EventListener, options?: boolean | EventListenerOptions) => {
        if (isNavigation(type)) navigation.delete(listener);
        remove(type, listener, options);
      },
    });
    const navigate = (url: string) => act(() => { node.dispatchEvent(Object.assign(new window.Event('did-navigate'), { url })); });
    return { guest: node as unknown as HTMLWebViewElement, steps, listening: () => navigation.size, navigate };
  }
  const press = (command: SiteHistoryCommand) => act(() => { for (const listener of commands) listener(command); });
  // One stable port, as production's module-level default is: a fresh arrow per render would re-run
  // every effect that depends on it.
  const getBridge = () => bridge;
  const hook = renderHook(t, () => useSiteWorkspace(OWN, false, { getBridge }));

  const first = recordingGuest({ canGoBack: true, canGoForward: false });
  act(() => hook.current().guestRef(first.guest));
  assert.deepEqual(hook.current().history, { canGoBack: true, canGoForward: false });
  first.navigate('http://127.0.0.1:4100/admin/posts');
  assert.equal(hook.current().displayUrl, 'http://127.0.0.1:4100/admin/posts');
  press('back');
  assert.deepEqual(first.steps, ['back']);

  const second = recordingGuest({ canGoBack: false, canGoForward: true });
  act(() => hook.current().guestRef(second.guest));
  assert.deepEqual(hook.current().history, { canGoBack: false, canGoForward: true }, 'a new guest starts from its own history');
  assert.equal(hook.current().displayUrl, 'http://127.0.0.1:4100/admin/', 'and from the requested url, not the old guest\'s');
  assert.deepEqual([first.listening(), second.listening()], [0, 2], 'the navigation listeners moved to the new guest');
  assert.equal(commands.size, 1, 'one accelerator subscription, re-pointed rather than accumulated');
  press('forward');
  assert.deepEqual([first.steps, second.steps], [['back'], ['forward']]);

  hook.unmount();
  assert.equal(second.listening(), 0);
  assert.equal(commands.size, 0);
});
