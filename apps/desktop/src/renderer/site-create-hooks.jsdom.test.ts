/**
 * @file `useAddSite` and `useCreateSitePluginTokens` rendered from their REAL modules under jsdom,
 * with the preload bridge injected through each hook's `getBridge` option — no module mocks.
 *
 * Their sibling tests (`use-add-site.hooks.test.ts`, `use-create-site-plugin-tokens.hooks.test.ts`)
 * execute the hook SOURCE through `sourceFunction`, which the coverage report cannot attribute to
 * the file. These tests assert the same observable contract through a real React root: what the
 * header button shows while pending, after a refusal and after a duplicate; and which pasted
 * tokens ride along with a create.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { act, createElement } from 'react';

import type { CreateSiteInput, SiteRecord, TokenSignInPlugin } from '../contracts/project.js';
import { NO_BRIDGE_MESSAGE, CANCELLED_MESSAGE, useAddSite } from './use-add-site.hooks.js';
import { useCreateSitePluginTokens } from './use-create-site-plugin-tokens.hooks.js';

type TestContext = { after: (fn: () => void) => void };

// One jsdom for the whole file: node --test runs each test file in its own process.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
// After the globals: react-dom probes `document` when first evaluated.
const { createRoot } = await import('react-dom/client');

/** Render `useHook` into its own jsdom root; `current()` is the latest return value. */
function renderHook<T>(t: TestContext, useHook: () => T) {
  let latest!: T;
  function Probe() { latest = useHook(); return null; }
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; act(() => root.unmount()); } };
  t.after(unmount);
  const rerender = () => act(() => root.render(createElement(Probe)));
  rerender();
  return { current: () => latest, rerender, unmount };
}

/**
 * A STABLE bridge reader, made once per bridge. The hooks key their effects on the reader's
 * identity (as `useSiteFolders` does), so a fresh lambda per render would re-request every render.
 */
const readers = new WeakMap<object, () => unknown>();
function reader<T extends object>(bridge: T): () => T {
  if (!readers.has(bridge)) readers.set(bridge, () => bridge);
  return readers.get(bridge) as () => T;
}

const settle = () => act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });

function siteRecord(id: string, extra: Partial<SiteRecord & { alreadyTracked: boolean }> = {}) {
  return { id, slug: path.basename(id), displayName: path.basename(id), installDir: id, ...extra } as SiteRecord & { alreadyTracked?: boolean };
}

/** A projects list owned by the test, updated the way React's state setter would be. */
function projectList(initial: readonly SiteRecord[]) {
  let projects = initial;
  const setProjects = (next: readonly SiteRecord[] | ((current: readonly SiteRecord[]) => readonly SiteRecord[])) => {
    projects = typeof next === 'function' ? next(projects) : next;
  };
  return { setProjects, current: () => projects };
}

test('useAddSite: pending while the picker is open, then the new card first and no message', async (t) => {
  const list = projectList([siteRecord('/sites/old')]);
  let finish!: (record: SiteRecord) => void;
  const bridge = { addSite: () => new Promise<SiteRecord | null>((resolve) => { finish = resolve; }) };
  const hook = renderHook(t, () => useAddSite({ setProjects: list.setProjects }, { getBridge: reader(bridge) }));
  assert.deepEqual([hook.current().adding, hook.current().addError, hook.current().addNotice], [false, null, null]);

  let pending!: Promise<void>;
  act(() => { pending = hook.current().addSite(); });
  assert.equal(hook.current().adding, true);
  await act(async () => { finish(siteRecord('/sites/new')); await pending; });
  assert.equal(hook.current().adding, false);
  assert.equal(hook.current().addError, null);
  assert.equal(hook.current().addNotice, null);
  assert.deepEqual(list.current().map((site) => site.id), ['/sites/new', '/sites/old']);
});

test('useAddSite: a duplicate keeps one card, says so for that site, and opens its tab', async (t) => {
  const list = projectList([siteRecord('/sites/a'), siteRecord('/sites/b')]);
  const opened: string[] = [];
  const bridge = { addSite: async () => siteRecord('/sites/a', { alreadyTracked: true }) };
  const hook = renderHook(t, () => useAddSite({ setProjects: list.setProjects }, { getBridge: reader(bridge), onAlreadyTracked: (id) => opened.push(id) }));
  await act(() => hook.current().addSite());
  assert.equal(hook.current().addError, 'a is already in your list.');
  assert.deepEqual(hook.current().addNotice, { siteId: '/sites/a', message: 'a is already in your list.' });
  assert.deepEqual(opened, ['/sites/a']);
  assert.deepEqual(list.current().map((site) => site.id), ['/sites/a', '/sites/b']);

  act(() => hook.current().clearAddError());
  assert.equal(hook.current().addError, null);
  assert.equal(hook.current().addNotice, null);
});

test('useAddSite: a duplicate without a tab opener still reports it', async (t) => {
  const list = projectList([]);
  const bridge = { addSite: async () => siteRecord('/sites/a', { alreadyTracked: true }) };
  const hook = renderHook(t, () => useAddSite({ setProjects: list.setProjects }, { getBridge: reader(bridge) }));
  await act(() => hook.current().addSite());
  assert.equal(hook.current().addNotice?.siteId, '/sites/a');
});

test('useAddSite: cancelling the picker changes nothing and says nothing, either way main reports it', async (t) => {
  for (const addSite of [async () => null, async () => { throw new Error(CANCELLED_MESSAGE); }]) {
    const list = projectList([siteRecord('/sites/a')]);
    const bridge = { addSite };
    const hook = renderHook(t, () => useAddSite({ setProjects: list.setProjects }, { getBridge: reader(bridge) }));
    await act(() => hook.current().addSite());
    assert.equal(hook.current().addError, null);
    assert.equal(hook.current().adding, false);
    assert.deepEqual(list.current().map((site) => site.id), ['/sites/a']);
  }
});

test('useAddSite: a refusal is shown as recovery text, and the next attempt clears it first', async (t) => {
  const list = projectList([]);
  let refuse = true;
  const bridge = { addSite: async () => {
    if (refuse) throw new Error("Error invoking remote method 'runner:sites:add-site': Error: /tmp/x has no Tovu site in it yet.");
    return siteRecord('/sites/x');
  } };
  const hook = renderHook(t, () => useAddSite({ setProjects: list.setProjects }, { getBridge: reader(bridge) }));
  await act(() => hook.current().addSite());
  assert.equal(hook.current().addError, 'No Tovu website was found in this folder. Choose an existing website or use Create website.');
  refuse = false;
  await act(() => hook.current().addSite());
  assert.equal(hook.current().addError, null);
  assert.deepEqual(list.current().map((site) => site.id), ['/sites/x']);
});

test('useAddSite: outside the desktop app the button explains itself instead of doing nothing', async (t) => {
  const list = projectList([]);
  // No `getBridge`: the default reads `window.tovuRunner`, which a plain DOM does not have.
  const hook = renderHook(t, () => useAddSite({ setProjects: list.setProjects }));
  await act(() => hook.current().addSite());
  assert.equal(hook.current().addError, NO_BRIDGE_MESSAGE);
  assert.equal(hook.current().adding, false);
});

const supabase: TokenSignInPlugin = { pluginId: 'supabase', displayName: 'Supabase', helpUrl: 'https://example.test/tokens' };
const input: CreateSiteInput = { displayName: 'Corner Bakery', database: { kind: 'sqlite' } } as CreateSiteInput;

/** A password field as the form renders it: an uncontrolled input the hook reads at create time. */
function tokenField(value: string) {
  const element = document.createElement('input');
  element.type = 'password';
  element.value = value;
  return element;
}

test('useCreateSitePluginTokens: offers the services Tovu lists, and sends trimmed typed tokens once', async (t) => {
  const requests: number[] = [];
  const bridge = { listTokenSignInPlugins: async () => { requests.push(1); return [supabase]; } };
  const hook = renderHook(t, () => useCreateSitePluginTokens({}, { getBridge: reader(bridge) }));
  assert.deepEqual(hook.current().plugins, []);
  await settle();
  assert.deepEqual(hook.current().plugins, [supabase]);
  assert.equal(requests.length, 1);

  const field = tokenField('  sbp_value  ');
  const blank = tokenField('   ');
  hook.current().inputRef('supabase')(field);
  hook.current().inputRef('other')(blank);
  const received: CreateSiteInput[] = [];
  await hook.current().withTokens(async (value) => {
    assert.equal(field.value, '', 'the token leaves the DOM before the create is sent');
    received.push(value);
  })(input);
  assert.deepEqual(received, [{ ...input, agentPluginTokens: { supabase: 'sbp_value' } }]);

  hook.current().inputRef('supabase')(null);
  hook.current().inputRef('other')(null);
  await hook.current().withTokens(async (value) => { received.push(value); })(input);
  assert.equal(received[1], input, 'with no fields mounted the create input is passed through unchanged');
});

test('useCreateSitePluginTokens: hidden services are never requested and never send a token', async (t) => {
  const requests: number[] = [];
  const bridge = { listTokenSignInPlugins: async () => { requests.push(1); return [supabase]; } };
  const hook = renderHook(t, () => useCreateSitePluginTokens({}, { enabled: false, getBridge: reader(bridge) }));
  await settle();
  assert.deepEqual(requests, []);
  assert.deepEqual(hook.current().plugins, []);
  const field = tokenField('sbp_hidden');
  hook.current().inputRef('supabase')(field);
  let received: CreateSiteInput | undefined;
  await hook.current().withTokens(async (value) => { received = value; })(input);
  assert.equal(received, input);
  assert.equal(field.value, '', 'a hidden field is still cleared');
});

test('useCreateSitePluginTokens: no bridge method, a rejecting bridge, or a late reply all offer nothing', async (t) => {
  const empty = {};
  const rejecting = { listTokenSignInPlugins: async (): Promise<readonly TokenSignInPlugin[]> => { throw new Error('IPC down'); } };
  const none = renderHook(t, () => useCreateSitePluginTokens({}, { getBridge: reader(empty) }));
  const offline = renderHook(t, () => useCreateSitePluginTokens());
  const failing = renderHook(t, () => useCreateSitePluginTokens({}, { getBridge: reader(rejecting) }));
  let reply!: (plugins: readonly TokenSignInPlugin[]) => void;
  let enabled = true;
  const lateBridge = { listTokenSignInPlugins: () => new Promise<readonly TokenSignInPlugin[]>((resolve) => { reply = resolve; }) };
  const getBridge = () => lateBridge;
  const late = renderHook(t, () => useCreateSitePluginTokens({}, { enabled, getBridge }));
  enabled = false;
  late.rerender(); // hiding the section before the reply arrives
  await act(async () => { reply([supabase]); });
  await settle();
  for (const hook of [none, offline, failing, late]) assert.deepEqual(hook.current().plugins, []);
});
