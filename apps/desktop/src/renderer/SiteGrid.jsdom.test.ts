/**
 * @file `SiteGrid` rendered from its REAL module under jsdom, with each of its injectable hooks
 * (`useDeleteState`, `useRenameState`, `useActions`, `usePower`, `useLocate`, `usePreview`) replaced
 * by a hand-written fake that records what the card asked of it. No module mocks.
 *
 * The wiring tests beside this file assert on `SiteGrid.tsx`'s source text, and
 * `SiteGrid.refactor.test.ts` calls its private panels through `sourceFunction` — neither runs the
 * module the coverage report measures, and neither clicks a real button. These tests render whole
 * cards and press every control an operator can reach: the card itself, the ⋮ menu and its entries,
 * Start/Stop/Restart, Locate/Remove, and the rename / delete / external-stop panels.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import * as React from 'react';
import { act, createElement } from 'react';

import type { SiteRecord } from '../contracts/project.js';
import { SiteGrid } from './SiteGrid.js';
import { deleteActionCopy } from './SiteGrid.hooks.js';
import { externalStopConfirm } from './use-site-power.hooks.js';
import type { SiteRenameState } from './use-site-rename.hooks.js';
import type { SitePower } from './use-site-power.hooks.js';
import type { SiteLocate } from './use-site-locate.hooks.js';

type TestContext = { after: (fn: () => void) => void };
type GridProps = Parameters<typeof SiteGrid>[0];

// One jsdom for the whole file: node --test runs each test file in its own process.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
const globals = { React, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
// `navigator` is a getter-only global in Node 21+, so each one is defined rather than assigned.
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
// After the globals: react-dom probes `document` when first evaluated.
const { createRoot } = await import('react-dom/client');

function site(id: string, fields: Partial<SiteRecord> = {}): SiteRecord {
  return {
    id, installDir: id, slug: 'bakery', displayName: 'Bakery', port: 0, partition: 'fixture',
    templateId: 'blank', templateVersion: null, database: { kind: 'sqlite' }, desiredState: 'stopped',
    status: 'stopped', statusDetail: null, deleteErasesFiles: false, previewVersion: null,
    folderMissing: false, createdAt: 'date', updatedAt: 'date', ...fields,
  } as SiteRecord;
}

/** Every hook the grid takes, as fakes over one mutable `state` the test sets per scenario. */
function fakeHooks() {
  const calls: string[] = [];
  const state = {
    pendingId: null as string | null,
    deletingId: null as string | null,
    deleteError: null as string | null,
    renamingId: null as string | null,
    draft: 'Bakery',
    saving: false,
    canSave: true,
    renameError: null as string | null,
    statuses: {} as Record<string, SiteRecord['status']>,
    errors: {} as Record<string, string>,
    restart: null as ReturnType<SitePower['restartControlOf']> | null,
    withRestart: true,
    withStopConfirm: true,
    confirmingStopId: undefined as string | null | undefined,
    locatingId: null as string | null,
    locateErrors: {} as Record<string, string>,
    previews: {} as Record<string, string>,
  };
  const hooks: Partial<GridProps> = {
    useDeleteState: () => ({
      pendingId: state.pendingId, deletingId: state.deletingId, deleteError: state.deleteError,
      requestDelete: (id: string) => { calls.push(`request delete ${id}`); },
      cancelDelete: () => { calls.push('cancel delete'); },
      confirmDelete: async (id: string) => { calls.push(`confirm delete ${id}`); },
    }),
    useRenameState: (): SiteRenameState => ({
      renamingId: state.renamingId, draft: state.draft, saving: state.saving, canSave: state.canSave,
      renameError: state.renameError,
      setDraft: (next) => { calls.push(`draft ${next}`); },
      startRename: (project) => { calls.push(`start rename ${project.id}`); },
      cancelRename: () => { calls.push('cancel rename'); },
      submitRename: async (id) => { calls.push(`submit rename ${id}`); },
    }),
    useActions: () => ({ openInBrowser: async (id: string) => { calls.push(`browser ${id}`); return null; } }),
    usePower: () => {
      const power: SitePower = {
        statusOf: (project) => state.statuses[project.id] ?? project.status,
        errorOf: (id) => state.errors[id] ?? null,
        toggle: async (project) => { calls.push(`toggle ${project.id}`); },
        restart: async (project) => { calls.push(`restart ${project.id}`); },
        restartControlOf: (project) => state.restart ?? { label: 'Restart', ariaLabel: `Restart ${project.displayName}`, disabled: false },
      };
      if (!state.withRestart) Reflect.deleteProperty(power, 'restartControlOf');
      if (state.withStopConfirm) {
        power.confirmingStopId = state.confirmingStopId;
        power.confirmStop = async (project) => { calls.push(`confirm stop ${project.id}`); };
        power.cancelStop = () => { calls.push('cancel stop'); };
      } else if (state.confirmingStopId !== undefined) {
        power.confirmingStopId = state.confirmingStopId;
      }
      return power;
    },
    useLocate: (): SiteLocate => ({
      locatingId: state.locatingId,
      errorOf: (id) => state.locateErrors[id] ?? null,
      locate: async (id) => { calls.push(`locate ${id}`); },
    }),
    usePreview: ({ id }: { id: string }) => state.previews[id] ?? null,
  };
  return { calls, state, hooks };
}

function renderGrid(t: TestContext, projects: SiteRecord[], fakes = fakeHooks()) {
  const opened: string[] = [];
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  t.after(() => { act(() => root.unmount()); host.remove(); });
  const render = (records = projects) => act(() => root.render(createElement(SiteGrid, {
    projects: records, onOpen: (id: string) => { opened.push(id); }, onDelete: async () => {}, ...fakes.hooks,
  } as GridProps)));
  render();
  const cards = () => [...host.querySelectorAll<HTMLElement>('article.card')];
  const button = (card: Element, name: string | RegExp) => {
    const found = [...card.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
      typeof name === 'string' ? candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name : name.test(candidate.textContent ?? ''));
    assert.ok(found, `no button ${String(name)}`);
    return found;
  };
  const click = (element: Element) => act(() => { (element as HTMLElement).click(); });
  return { ...fakes, host, opened, render, cards, button, click };
}

test('a stopped card opens on click and Enter, shows its details, and Start reaches the power hook', (t) => {
  const grid = renderGrid(t, [site('/sites/bakery', { templateVersion: '1.4.0' })]);
  const [card] = grid.cards();
  assert.equal(card!.getAttribute('role'), 'button');
  assert.match(card!.className, /is-stopped/);
  assert.ok(card!.querySelector('svg.card__placeholder'), 'no capture yet: the neutral placeholder');
  assert.equal(card!.querySelector('.card__details')!.textContent, 'SQLite · Tovu 1.4.0');
  assert.equal(card!.querySelector('.card__parent'), null);
  grid.click(card!);
  act(() => { card!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.deepEqual(grid.opened, ['/sites/bakery', '/sites/bakery']);

  grid.click(grid.button(card!, 'Start Bakery'));
  grid.click(grid.button(card!, 'Restart Bakery'));
  assert.deepEqual(grid.calls, ['toggle /sites/bakery', 'restart /sites/bakery']);
  assert.equal(grid.opened.length, 2, 'action buttons never also open the card');
  act(() => { grid.button(card!, 'Start Bakery').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.equal(grid.opened.length, 2, 'a key on an action button does not reach the card either');
});

test('a running card shows its capture, failure line and details; the menu offers browser, rename and delete', (t) => {
  const fakes = fakeHooks();
  fakes.state.previews['/sites/live'] = 'blob:capture';
  fakes.state.errors['/sites/live'] = 'Port 3000 is in use.';
  const running = site('/sites/live', { status: 'running', port: 4321, runningApp: 'Web', deleteErasesFiles: true });
  const failed = site('/sites/failed', { status: 'failed', statusDetail: 'the server exited (code 1)' });
  const grid = renderGrid(t, [running, failed], fakes);
  const [card, failedCard] = grid.cards();
  assert.equal(card!.querySelector('img.card__preview')!.getAttribute('src'), 'blob:capture');
  assert.equal(card!.querySelector('.state')!.getAttribute('title'), 'Running in Web at http://localhost:4321');
  assert.equal(card!.querySelector('.card__actionerror')!.textContent, 'Port 3000 is in use.');
  assert.equal(failedCard!.querySelector('.card__detail')!.textContent, 'the server exited (code 1)');
  assert.ok(grid.button(card!, 'Stop Bakery'));

  const trigger = grid.button(card!, 'More actions for Bakery');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  grid.click(trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  const items = [...card!.querySelectorAll('[role="menuitem"]')].map((item) => [item.textContent?.trim(), item.className]);
  assert.deepEqual(items, [
    ['Rename…', 'card__menuitem'],
    ['Open in browser', 'card__menuitem'],
    ['Delete…', 'card__menuitem card__menuitem--danger'],
  ]);
  grid.click(grid.button(card!, 'Open in browser'));
  assert.equal(card!.querySelector('[role="menu"]'), null, 'choosing an entry closes the menu');
  grid.click(trigger);
  grid.click(grid.button(card!, 'Rename…'));
  grid.click(trigger);
  grid.click(grid.button(card!, 'Delete…'));
  grid.click(trigger);
  grid.click(trigger);
  assert.equal(card!.querySelector('[role="menu"]'), null, 'the trigger toggles the menu closed');
  assert.deepEqual(grid.calls, ['browser /sites/live', 'start rename /sites/live', 'request delete /sites/live']);
  assert.deepEqual(grid.opened, [], 'nothing in the menu opens the card');

  grid.click(grid.button(failedCard!, 'More actions for Bakery'));
  const failedItems = [...failedCard!.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());
  assert.deepEqual(failedItems, ['Rename…', deleteActionCopy(failed).menuItemLabel], 'Open in browser is only for a running site');
  act(() => { failedCard!.querySelector('.card__menu')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'x', bubbles: true })); });
});

test('duplicate names show each parent folder; a root-level folder reads as "/"', (t) => {
  const grid = renderGrid(t, [site('/bakery'), site('/other/bakery'), site('/sites/solo', { displayName: 'Solo' })]);
  const parents = grid.cards().map((card) => card.querySelector('.card__parent')?.textContent ?? null);
  assert.deepEqual(parents, ['/', '/other', null]);
});

test('a missing folder offers Locate and Remove instead of Start, and shows Locate progress and refusal', (t) => {
  const fakes = fakeHooks();
  const missing = site('/sites/gone', { folderMissing: true });
  const grid = renderGrid(t, [missing], fakes);
  let [card] = grid.cards();
  assert.equal(card!.getAttribute('role'), null, 'a missing site is not openable');
  assert.match(card!.textContent!, /Folder moved or not a site/);
  assert.throws(() => grid.button(card!, 'Start Bakery'));
  grid.click(grid.button(card!, 'Locate the folder for Bakery'));
  grid.click(grid.button(card!, 'Remove'));
  assert.deepEqual(grid.calls, ['locate /sites/gone', 'request delete /sites/gone']);

  fakes.state.locatingId = '/sites/gone';
  fakes.state.locateErrors['/sites/gone'] = 'That folder is not a Tovu site.';
  grid.render();
  [card] = grid.cards();
  const locate = grid.button(card!, 'Locate the folder for Bakery');
  assert.equal(locate.textContent, 'Locating…');
  assert.equal(locate.disabled, true);
  assert.equal(card!.querySelector('.card__actionerror')!.textContent, 'That folder is not a Tovu site.');
});

test('mid-transition, provisioning, external and restart-less cards render the matching control', (t) => {
  const fakes = fakeHooks();
  fakes.state.statuses['/sites/a'] = 'starting';
  fakes.state.withRestart = false;
  const external = site('/sites/ext', { status: 'running', externalUrl: 'http://localhost:5173' });
  const provisioning = site('/sites/new', { status: 'provisioning' });
  const grid = renderGrid(t, [site('/sites/a'), external, provisioning], fakes);
  const [starting, ext, draft] = grid.cards();
  const busy = grid.button(starting!, 'Starting… Bakery');
  assert.equal(busy.disabled, true, 'no second action while one is in flight');
  assert.equal(starting!.querySelectorAll('button.card__restart').length, 0, 'no restart control when the hook offers none');
  assert.equal(ext!.querySelector('button.card__power'), null, 'a site another process serves has no Start/Stop');
  assert.equal(draft!.querySelector('.card__draft')!.textContent, 'Provisioning setup');
  assert.equal(draft!.querySelector('button.card__power'), null, 'a provisioning site has no lifecycle control');
});

test('the delete confirm owns the card: cancel, confirm, busy label and main\'s refusal', (t) => {
  const fakes = fakeHooks();
  const project = site('/sites/bakery', { deleteErasesFiles: true });
  const copy = deleteActionCopy(project);
  fakes.state.pendingId = project.id;
  const grid = renderGrid(t, [project], fakes);
  let [card] = grid.cards();
  assert.equal(card!.getAttribute('role'), null, 'a card with an open panel is inert');
  assert.equal(card!.querySelector('.card__menu'), null, 'the ⋮ yields to the panel');
  const panel = card!.querySelector('.card__confirm')!;
  assert.equal(panel.getAttribute('aria-label'), copy.confirmTitle);
  assert.equal(panel.querySelector('.card__confirmbody')!.textContent, copy.confirmBody.replaceAll('`', ''));
  grid.click(grid.button(panel, 'Cancel'));
  grid.click(grid.button(panel, copy.confirmButtonLabel));
  act(() => { panel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.deepEqual(grid.calls, ['cancel delete', `confirm delete ${project.id}`]);

  fakes.state.deletingId = project.id;
  fakes.state.deleteError = 'Main refused.';
  grid.render();
  [card] = grid.cards();
  assert.equal(card!.querySelector('[role="alert"]')!.textContent, 'Main refused.');
  const buttons = [...card!.querySelectorAll<HTMLButtonElement>('.card__confirmacts button')];
  assert.deepEqual(buttons.map((button) => [button.textContent, button.disabled]), [['Cancel', true], [copy.confirmButtonBusyLabel, true]]);
});

test('a confirm body names commands as code', (t) => {
  const fakes = fakeHooks();
  const project = site('/sites/dev', { status: 'running', externalUrl: 'http://localhost:4321', externalLauncher: 'npm-run-dev' } as Partial<SiteRecord>);
  fakes.state.confirmingStopId = project.id;
  const grid = renderGrid(t, [project], fakes);
  const confirm = externalStopConfirm({ project })!;
  const panel = grid.cards()[0]!.querySelector('.card__confirm')!;
  assert.equal(panel.getAttribute('aria-label'), confirm.confirmTitle);
  assert.ok(panel.querySelector('.card__confirmbody code'), 'backticked text renders as <code>');
  grid.click(grid.button(panel, 'Cancel'));
  grid.click(grid.button(panel, confirm.confirmButtonLabel));
  assert.deepEqual(grid.calls, ['cancel stop', `confirm stop ${project.id}`]);
});

test('an external stop panel falls back to the delete copy and tolerates a power hook without stop confirm', (t) => {
  const fakes = fakeHooks();
  const project = site('/sites/plain', { status: 'running' });
  fakes.state.withStopConfirm = false;
  fakes.state.confirmingStopId = project.id;
  const grid = renderGrid(t, [project], fakes);
  const panel = grid.cards()[0]!.querySelector('.card__confirm')!;
  const copy = deleteActionCopy(project);
  assert.equal(panel.getAttribute('aria-label'), copy.confirmTitle);
  grid.click(grid.button(panel, 'Cancel'));
  grid.click(grid.button(panel, copy.confirmButtonLabel));
  assert.deepEqual(grid.calls, [], 'no stop-confirm hook: both buttons are inert, not a crash');
});

test('the rename panel edits the draft, saves, cancels, and shows both hints and main\'s refusal', (t) => {
  const fakes = fakeHooks();
  const project = site('/sites/bakery');
  fakes.state.renamingId = project.id;
  const grid = renderGrid(t, [project], fakes);
  let panel = grid.cards()[0]!.querySelector('.card__confirm')!;
  assert.equal(panel.getAttribute('aria-label'), 'Rename Bakery');
  const input = panel.querySelector<HTMLInputElement>('input.card__renameinput')!;
  assert.equal(input.value, 'Bakery');
  assert.equal(panel.querySelectorAll('.card__confirmerror').length, 0);
  act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Corner Bakery');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  grid.click(grid.button(panel, 'Save'));
  grid.click(grid.button(panel, 'Cancel'));
  act(() => { panel.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  act(() => { panel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.deepEqual(grid.calls, ['draft Corner Bakery', `submit rename ${project.id}`, 'cancel rename']);
  assert.deepEqual(grid.opened, []);

  Object.assign(fakes.state, { draft: 'x'.repeat(201), saving: true, canSave: false, renameError: 'That name is taken.' });
  grid.render();
  panel = grid.cards()[0]!.querySelector('.card__confirm')!;
  const errors = [...panel.querySelectorAll('.card__confirmerror')].map((node) => node.textContent);
  assert.deepEqual(errors, ['A name must be 1 to 200 characters, not counting spaces at either end.', 'That name is taken.']);
  assert.equal(grid.button(panel, 'Saving…').disabled, true);
  assert.equal(panel.querySelector<HTMLInputElement>('input')!.disabled, true);
});

test('the default hooks render a card outside the desktop app without a bridge', (t) => {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  t.after(() => { act(() => root.unmount()); host.remove(); });
  act(() => root.render(createElement(SiteGrid, { projects: [site('/sites/plain')], onOpen: () => {}, onDelete: async () => {} })));
  assert.equal(host.querySelectorAll('article.card').length, 1);
  assert.ok(host.querySelector('svg.card__placeholder'), 'no bridge, no capture: the placeholder');
});
