import { runFind, type FindableGuest } from './use-find-in-page.hooks.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hookHarness, sourceFunction, elements } from './source-test-harness.js';
import { siteNameError, SITE_NAME_ERROR, namePasteHandler } from '../contracts/site-name.js';
import { humanSiteError, tabAfterClose, readyNoticeStillTrue, dismissOnEscape, addedSiteMessage } from './site-shell-policy.js';
import { createFindQueryScheduler, FIND_QUERY_SETTLE_MS } from './find-query-scheduler.js';
import { revealActiveTab, tabOverflow } from './use-tab-strip.hooks.js';
import { computeCanCreate, buildCreateProjectInput, siteSlug } from './App.hooks.js';
import { renameSubmission, canSubmitRename } from './use-site-rename.hooks.js';
import { deleteActionCopy } from './SiteGrid.hooks.js';
import { describeAddFailure, mergeAddedSite, NO_BRIDGE_MESSAGE } from './use-add-site.hooks.js';
import type { SiteRecord, CreatedSiteRecord } from '../contracts/project.js';
import type { RunnerInventoryBridge } from './runner-api.js';

const hooks = readFileSync(new URL('./App.hooks.ts', import.meta.url), 'utf8');
const site = (fields: Partial<SiteRecord> = {}) => ({ id: '/site', displayName: 'My website', status: 'stopped', folderMissing: false, ...fields }) as SiteRecord;
function keyboard() {
  const listeners = new Set<(event: { key: string }) => void>();
  return {
    document: { addEventListener: (_type: string, listener: (event: { key: string }) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: { key: string }) => void) => listeners.delete(listener) },
    press: (key: string) => { for (const listener of [...listeners]) listener({ key }); },
    listeners,
  };
}

test('D-02/D-17: Create and Rename reject invalid drafts locally, with the same exact inline validation', async () => {
  const harness = hookHarness();
  let creates = 0;
  const useForm = sourceFunction(hooks, 'useCreateWebsiteForm', {
    ...harness.bindings, useRef: () => ({ current: null }), siteNameError, SITE_NAME_ERROR, computeCanCreate,
    siteSlug, buildCreateProjectInput, refValue: () => '', humanSiteError,
  });
  const render = () => harness.render(() => useForm(async () => { creates++; }));
  for (const name of ['   ', 'x'.repeat(201)]) {
    render().setName(name);
    assert.equal(render().canCreate, false);
    assert.equal(render().nameError, SITE_NAME_ERROR);
    await render().handleSubmit({ preventDefault() {} });
    assert.equal(creates, 0, 'no picker call for an invalid name');
    assert.deepEqual(renameSubmission({} as RunnerInventoryBridge, '/site', name), { kind: 'refused', message: SITE_NAME_ERROR });
    assert.equal(canSubmitRename(name, false), false);
  }
  for (const name of ['a', 'x'.repeat(200), '  Café ☕ 日本語  ']) {
    assert.equal(siteNameError({ name }), null);
    render().setName(name);
    assert.equal(render().canCreate, true);
  }
});

test('D-03: a cancelled Create keeps the form open without inserting a row or a ready notice', async () => {
  const harness = hookHarness();
  const useMutations = sourceFunction(hooks, 'useProjectMutations', {
    ...harness.bindings, readyNoticeStillTrue, runnerInventoryBridge: () => ({ createSite: async () => null }),
  });
  let exits = 0;
  const deps = { projects: [], setProjects: () => assert.fail('cancellation must not insert a site'),
    closeProjectTab: () => {}, stopCreating: () => { exits++; }, startCreating: () => {} };
  const render = () => harness.render(() => useMutations(deps));
  await render().handleCreate({ displayName: 'My website', database: { kind: 'sqlite' } });
  assert.equal(exits, 0);
  assert.equal(render().lastCreated, null);
  assert.equal(render().createFormKey, 0);
});

test('D-03/D-09: cancelled Add is silent; an already-tracked Add reports the exact name and opens that site', async () => {
  for (const added of [null, { ...site(), alreadyTracked: true }]) {
    const harness = hookHarness();
    const useAdd = sourceFunction(readFileSync(new URL('./use-add-site.hooks.ts', import.meta.url), 'utf8'), 'useAddSite', {
      ...harness.bindings, NO_BRIDGE_MESSAGE, describeAddFailure, mergeAddedSite, addedSiteMessage,
      runnerInventoryBridge: () => ({ addSite: async () => added }),
    });
    const opened: string[] = [];
    let projects: readonly SiteRecord[] = [site()];
    const setProjects = (update: (current: readonly SiteRecord[]) => readonly SiteRecord[]) => { projects = update(projects); };
    const render = () => harness.render(() => useAdd({ setProjects }, { onAlreadyTracked: (id: string) => opened.push(id) }));
    await render().addSite();
    assert.equal(render().addError, added ? 'My website is already in your list.' : null);
    assert.deepEqual(opened, added ? ['/site'] : []);
    assert.equal(projects.length, 1);
  }
});

test('D-12/D-01: Escape dismisses confirmation, and a rejected Delete keeps its panel with a human error', async () => {
  const harness = hookHarness();
  const keys = keyboard();
  const useDelete = sourceFunction(hooks, 'useDeleteConfirmation', { ...harness.bindings, ...keys, dismissOnEscape, humanSiteError });
  const render = () => harness.render(() => useDelete(async () => {
    throw new Error("Error invoking remote method 'runner:sites:delete': Error: Could not delete this website. Permission was denied. Its card has been kept so you can try again.");
  }));
  render().requestDelete('/site');
  render();
  keys.press('Escape');
  assert.equal(render().pendingId, null);
  render().requestDelete('/site');
  await render().confirmDelete('/site');
  assert.equal(render().pendingId, '/site');
  assert.equal(render().deleteError, 'Could not delete this website. Permission was denied. Its card has been kept so you can try again.');
  harness.cleanup();
  assert.equal(keys.listeners.size, 0);
});

test('D-12: Escape closes the menu and Rename even when focus is on a panel button', () => {
  let dismissed = 0;
  dismissOnEscape({ event: { key: 'Enter' }, dismiss: () => { dismissed++; } });
  dismissOnEscape({ event: { key: 'Escape' }, dismiss: () => { dismissed++; }, busy: true });
  dismissOnEscape({ event: { key: 'Escape', isComposing: true }, dismiss: () => { dismissed++; } });
  assert.equal(dismissed, 0);
  dismissOnEscape({ event: { key: 'Escape' }, dismiss: () => { dismissed++; } });
  assert.equal(dismissed, 1);
  const harness = hookHarness();
  const keys = keyboard();
  const useMenu = sourceFunction(hooks, 'useDismissibleDropdown', {
    ...harness.bindings, document: keys.document, dismissOnEscape, useRef: () => ({ current: null }),
  });
  const render = () => harness.render(() => useMenu());
  render().setOpen(true);
  render(); keys.press('Escape');
  assert.equal(render().open, false);
  harness.cleanup();
  const renameHarness = hookHarness();
  const renameKeys = keyboard();
  const useRename = sourceFunction(readFileSync(new URL('./use-site-rename.hooks.ts', import.meta.url), 'utf8'), 'useSiteRename', {
    ...renameHarness.bindings, document: renameKeys.document, dismissOnEscape, canSubmitRename,
  });
  const rename = () => renameHarness.render(() => useRename());
  rename().startRename(site()); rename(); renameKeys.press('Escape');
  assert.equal(rename().renamingId, null);
  renameHarness.cleanup();
});

test('D-14: closing the active tab picks right, else left, and preserves an unrelated selection', () => {
  const tabs = ['a', 'b', 'c'];
  assert.equal(tabAfterClose({ tabs, active: 'b', closing: 'b' }), 'c');
  assert.equal(tabAfterClose({ tabs, active: 'c', closing: 'c' }), 'b');
  assert.equal(tabAfterClose({ tabs, active: 'a', closing: 'a' }), 'b');
  assert.equal(tabAfterClose({ tabs: ['a'], active: 'a', closing: 'a' }), null);
  assert.equal(tabAfterClose({ tabs, active: 'b', closing: 'a' }), 'b');
  assert.equal(tabAfterClose({ tabs, active: null, closing: 'a' }), null);
});

test('D-18: a missing website keeps its name in truthful Remove copy', () => {
  const copy = deleteActionCopy(site({ folderMissing: true, deleteErasesFiles: false }));
  assert.equal(copy.confirmTitle, 'Remove My website from Projects?');
  assert.equal(copy.confirmBody, 'Removes this website from your list. Its folder is missing, so there are no files here to delete.');
  assert.equal(copy.confirmButtonLabel, 'Remove');
});

test('D-19: the ready notice disappears on start, missing folder, or removal and uses no stale status', () => {
  const created = site() as CreatedSiteRecord;
  assert.equal(readyNoticeStillTrue({ created, projects: [site()] }), true);
  for (const status of ['starting', 'running', 'stopping', 'blocked'] as const) {
    assert.equal(readyNoticeStillTrue({ created, projects: [site({ status })] }), false);
  }
  assert.equal(readyNoticeStillTrue({ created, projects: [site({ folderMissing: true })] }), false);
  assert.equal(readyNoticeStillTrue({ created, projects: [] }), false);
  assert.equal(readyNoticeStillTrue({ created, projects: [site({ displayName: 'Renamed' })] }), false);
  assert.equal(readyNoticeStillTrue({ created: null, projects: [site()] }), false);
});

test('D-20: fast typing issues one search for the complete exact query; clear/close cancels it and Enter flushes it', () => {
  const timers = new Map<number, () => void>();
  let next = 0;
  const scheduler = createFindQueryScheduler({}, { clock: {
    schedule: (callback, delay) => { assert.equal(delay, FIND_QUERY_SETTLE_MS); timers.set(++next, callback); return next; },
    cancel: (timer) => { timers.delete(timer as number); },
  } });
  const finds: string[] = [];
  const guest: FindableGuest = {
    findInPage: (text) => { finds.push(text); return 1; },
    stopFindInPage() {}, addEventListener() {}, removeEventListener() {},
  };
  for (let length = 1; length <= 'Plugin API'.length; length++) {
    const text = 'Plugin API'.slice(0, length);
    scheduler.schedule({ run: () => runFind({ kind: 'guest', element: guest }, undefined, text, { forward: true, findNext: true }, null) });
    assert.deepEqual(finds, []);
    assert.equal(timers.size, 1);
  }
  for (const callback of [...timers.values()]) callback();
  assert.deepEqual(finds, ['Plugin API']);
  scheduler.schedule({ run: () => finds.push('cancelled') }); scheduler.cancel();
  assert.equal(timers.size, 0);
  assert.equal(scheduler.flush(), false);
  scheduler.schedule({ run: () => finds.push('Enter') });
  assert.equal(scheduler.flush(), true);
  assert.deepEqual(finds, ['Plugin API', 'Enter']);
  assert.equal(timers.size, 0);
});

test('D-24: IPC and AddSitePointerError class prefixes never reach the operator', () => {
  assert.equal(describeAddFailure(new Error("Error invoking remote method 'runner:sites:add-site': AddSitePointerError: This folder is not a Tovu website.")), 'This folder is not a Tovu website.');
  assert.equal(humanSiteError({ error: "Error invoking remote method 'runner:sites:create': Error: Could not create website.", fallback: 'unknown' }), 'Could not create website.');
});

test('D-26: the active tab scrolls into view and overflow buttons expose the hidden direction', () => {
  const calls: unknown[] = [];
  revealActiveTab({ strip: { querySelector: <T extends Element>(selector: string) => {
    assert.equal(selector, '.is-active');
    return { scrollIntoView: (options: unknown) => calls.push(options) } as unknown as T;
  } } });
  assert.deepEqual(calls, [{ block: 'nearest', inline: 'nearest' }]);
  assert.deepEqual(tabOverflow({ strip: { scrollWidth: 700, clientWidth: 500, scrollLeft: 0 } }), { left: false, right: true });
  assert.deepEqual(tabOverflow({ strip: { scrollWidth: 700, clientWidth: 500, scrollLeft: 200 } }), { left: true, right: false });
});

test('D-28: truncated tab names expose the full name as a title', () => {
  const name = 'Café ☕ 日本語 — a very long website name';
  const TabStrip = sourceFunction(readFileSync(new URL('./App.tsx', import.meta.url), 'utf8'), 'TabStrip', {
    useTabStrip: () => ({ stripRef: null, overflow: { left: false, right: false }, scrollLeft() {}, scrollRight() {} }),
  });
  const tree = elements(TabStrip({ projects: [site({ displayName: name })], activeTab: '/site' }));
  assert.equal(tree.find((element) => element.props.className === 'tab__label' && element.props.children === name)?.props.title, name);
});

test('D-26: scroll arrows render only while the strip overflows, each disabled on its own exhausted side', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const arrows = (overflow: { left: boolean; right: boolean }) => {
    const TabStrip = sourceFunction(source, 'TabStrip', {
      useTabStrip: () => ({ stripRef: null, overflow, showArrows: overflow.left || overflow.right, scrollLeft() {}, scrollRight() {} }),
    });
    return elements(TabStrip({ projects: [site({})], activeTab: null }))
      .filter((element) => element.props?.className === 'tabstrip-arrow')
      .map((element) => [element.props['aria-label'], element.props.disabled]);
  };
  assert.deepEqual(arrows({ left: false, right: false }), [], 'no dead arrows when every tab fits');
  assert.deepEqual(arrows({ left: false, right: true }), [['Scroll tabs left', true], ['Scroll tabs right', false]]);
});


test('D-02/D-17: oversized paste preserves the full draft for validation instead of silently saving 200 characters', () => {
  let draft = '';
  let prevented = false;
  const name = 'x'.repeat(248);
  namePasteHandler({ setName: (next) => { draft = next; } })({
    clipboardData: { getData: () => name }, currentTarget: { value: 'old', selectionStart: 0, selectionEnd: 3 },
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(draft, name);
  assert.equal(siteNameError({ name: draft }), 'A name must be 1 to 200 characters, not counting spaces at either end.');
  assert.equal(canSubmitRename(draft, false), false);
});

test('D-14: the tab hook applies the neighbour decision when closing the active middle tab', () => {
  const harness = hookHarness();
  const useTabs = sourceFunction(hooks, 'useProjectTabs', { ...harness.bindings, tabAfterClose });
  const render = () => harness.render(() => useTabs());
  for (const id of ['a', 'b', 'c']) { render().openProjectTab(id); render(); }
  render().setActiveTab('b');
  render().closeProjectTab('b');
  assert.equal(render().activeTab, 'c');
  assert.deepEqual(render().openTabs, ['a', 'c']);
  render().closeProjectTab('c');
  assert.equal(render().activeTab, 'a');
});

test('D-19: the mutation hook permanently dismisses the ready notice once its site starts', async () => {
  const harness = hookHarness();
  const useMutations = sourceFunction(hooks, 'useProjectMutations', {
    ...harness.bindings, readyNoticeStillTrue, runnerInventoryBridge: () => ({ createSite: async () => site() }),
  });
  let projects: readonly SiteRecord[] = [];
  const render = () => harness.render(() => useMutations({ projects,
    setProjects: (update: (current: readonly SiteRecord[]) => readonly SiteRecord[]) => { projects = update(projects); },
    closeProjectTab() {}, startCreating() {}, stopCreating() {},
  }));
  await render().handleCreate({ displayName: 'My website', database: { kind: 'sqlite' } });
  assert.equal(render().lastCreated?.displayName, 'My website');
  projects = [site({ status: 'starting' })];
  assert.equal(render().lastCreated, null);
  projects = [site({ status: 'stopped' })];
  assert.equal(render().lastCreated, null, 'stopping again must not resurrect the notice');
});
