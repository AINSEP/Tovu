/**
 * @file `SiteGrid` rendered from its REAL module under jsdom, with each of its injectable hooks
 * (`useDeleteState`, `useRenameState`, `useActions`, `usePower`, `useLocate`, `usePreview`) replaced
 * by a hand-written fake that records what the card asked of it. No module mocks.
 *
 * These tests render whole cards and press every control an operator can reach: the card itself,
 * the ⋮ menu and its entries, Start/Stop/Restart, Locate/Remove, and the rename / delete /
 * external-stop panels. They replaced the source-text wiring tests that used to sit beside this
 * file (`site-card-actions-wiring`, `site-card-menu-wiring`, `card-preview-wiring`,
 * `SiteGrid.refactor`), which ran neither the module the coverage report measures nor a real click.
 * The CSS half of the card's layout stays in `site-card-actions-wiring.test.ts`: a stylesheet rule
 * is only checkable as text here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import * as React from 'react';
import { act, createElement } from 'react';

import type { SiteRecord } from '../contracts/project.js';
import type { ResourcesSnapshot } from '../contracts/resources.js';
import { SiteGrid } from './SiteGrid.js';
import { deleteActionCopy } from './SiteGrid.hooks.js';
import { externalStopConfirm, restartControl } from './use-site-power.hooks.js';
import { SITE_LIST_STORAGE_KEY, useSiteListPrefs, type SiteListStorage } from './use-site-list-prefs.hooks.js';
import { STATUS_LABEL } from './site-status.js';
import type { SiteRenameState } from './use-site-rename.hooks.js';
import type { SitePower } from './use-site-power.hooks.js';
import type { SiteLocate } from './use-site-locate.hooks.js';
import { ResourcesMonitor } from './ResourcesPanel.js';

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
        restartControlOf: (project) => state.restart ?? { label: 'Restart', ariaLabel: `Restart ${project.displayName}`, disabled: false, busy: false, tooltip: 'Restart site' },
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

/** `extra` overrides any grid prop, e.g. a recording `onDelete` or `onSiteUpdated`. */
function renderGrid(t: TestContext, projects: SiteRecord[], fakes = fakeHooks(), extra: Partial<GridProps> = {}) {
  const opened: string[] = [];
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  t.after(() => { act(() => root.unmount()); host.remove(); });
  const render = (records = projects) => act(() => root.render(createElement(SiteGrid, {
    projects: records, onOpen: (id: string) => { opened.push(id); }, onDelete: async () => {}, ...fakes.hooks, ...extra,
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
  assert.ok(card!.querySelector('svg.jini-site-card__placeholder'), 'no capture yet: the neutral placeholder');
  assert.equal(card!.querySelector('.jini-site-card__details')!.textContent, 'SQLite · Tovu 1.4.0');
  assert.equal(card!.querySelector('.card__parent'), null);
  grid.click(card!);
  act(() => { card!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.deepEqual(grid.opened, ['/sites/bakery', '/sites/bakery']);

  // Stopped: an outlined ⏻ glyph, no visible text; the sentence is the Jini tooltip.
  const start = grid.button(card!, 'Start Bakery');
  assert.equal(start.textContent, '');
  assert.ok(start.querySelector('svg.icon'));
  assert.equal(start.dataset.tooltip, 'Start site');
  assert.ok(start.classList.contains('button--quiet') && start.classList.contains('jini-tooltip'));
  assert.equal(start.getAttribute('aria-busy'), 'false');
  assert.equal(grid.button(card!, 'Restart Bakery').dataset.tooltip, 'Restart site');
  grid.click(start);
  grid.click(grid.button(card!, 'Restart Bakery'));
  assert.deepEqual(grid.calls, ['toggle /sites/bakery', 'restart /sites/bakery']);
  // Every event that starts in the action row stops there — clicks AND keys: the card is
  // keyboard-activated too, so Enter on Start would otherwise also open the site in a tab.
  assert.equal(grid.opened.length, 2, 'action buttons never also open the card');
  act(() => { grid.button(card!, 'Start Bakery').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.equal(grid.opened.length, 2, 'a key on an action button does not reach the card either');
});

test('running cards join resource figures by site id even when names match; stopped cards hide figures', (t) => {
  const records = [site('/sites/a', { status: 'running' }), site('/sites/b', { status: 'running' }), site('/sites/c')];
  const metrics = { rssBytes: 0, cpuPercent: null, memoryWarning: false, cpuWarning: false };
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  t.after(() => { act(() => root.unmount()); host.remove(); });
  act(() => root.render(createElement(ResourcesMonitor, {
    projects: records, onSiteUpdated() {},
    useReadings: (): ResourcesSnapshot => ({
      status: 'available', sampledAt: 1, pollIntervalMs: 60_000, totalMemoryBytes: 8_000_000_000, approximate: true,
      total: metrics, app: { ...metrics, siteId: null, processes: [] },
      sites: [
        { ...metrics, rssBytes: 120_000_000, siteId: '/sites/a', processes: [] },
        { ...metrics, rssBytes: 1_500_000_000, memoryWarning: true, siteId: '/sites/b', processes: [] },
      ],
    }),
    children: createElement(SiteGrid, { projects: records, onOpen() {}, onDelete: async () => {}, ...fakeHooks().hooks }),
  })));
  const figures = [...host.querySelectorAll('.card__resources')];
  assert.deepEqual(figures.map((figure) => figure.textContent), ['~0.1 GB', '~1.5 GB · High memory use']);
  assert.ok(figures[1]!.classList.contains('is-warning'));
});

test('a running card shows its capture, failure line and details; the menu offers browser, rename and delete', (t) => {
  const fakes = fakeHooks();
  fakes.state.previews['/sites/live'] = 'blob:capture';
  fakes.state.errors['/sites/live'] = 'Port 3000 is in use.';
  const running = site('/sites/live', { status: 'running', port: 4321, runningApp: 'Web', deleteErasesFiles: true, statusDetail: 'Running in Web (port 52612)' });
  const failed = site('/sites/failed', { status: 'failed', statusDetail: 'the server exited (code 1)' });
  const grid = renderGrid(t, [running, failed], fakes);
  // These fixtures tie on date and name, so the list's last tiebreak, the id, decides the order.
  const [failedCard, card] = grid.cards();
  assert.equal(card!.querySelector('img.jini-site-card__preview')!.getAttribute('src'), 'blob:capture');
  assert.equal(card!.querySelector('.jini-site-card__status')!.getAttribute('title'), 'Running in Web at http://localhost:4321');
  // Owner 2026-10-13: "Running in Web (port N)" is noise in the card's copy; it is the status title.
  assert.equal(card!.querySelector('.card__detail'), null, 'a site another app runs shows no detail line');
  assert.doesNotMatch(card!.textContent!, /port 52612/);
  assert.equal(card!.querySelector('.card__actionerror')!.textContent, 'Port 3000 is in use.');
  assert.equal(failedCard!.querySelector('.card__detail')!.textContent, 'the server exited (code 1)');
  const stop = grid.button(card!, 'Stop Bakery');
  assert.equal(stop.dataset.tooltip, 'Stop site');
  assert.ok(stop.classList.contains('button--create'), 'a running site\'s ⏻ is filled in the accent');

  const trigger = grid.button(card!, 'More actions for Bakery');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  grid.click(trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  const items = [...card!.querySelectorAll('[role="menuitem"]')].map((item) => [item.textContent?.trim(), item.className]);
  // Neither Start nor Stop is here, and not as a preference about menu length: Start USED to live
  // in this menu, and moved to the ⏻ in the action row when Stop became possible. The same action in
  // a menu AND on a button is two places to look for one thing. Delete is last, after the safe entries.
  assert.deepEqual(items, [
    ['Rename…', 'card__menuitem'],
    ['Open in browser', 'card__menuitem'],
    ['Hide from list', 'card__menuitem'],
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
  const failedItems = [...failedCard!.querySelectorAll('[role="menuitem"]')].map((item) => [item.textContent?.trim(), item.className]);
  // The danger styling is for a delete that erases files, never for an adopted site's "Remove".
  assert.deepEqual(failedItems, [['Rename…', 'card__menuitem'], ['Hide from list', 'card__menuitem'], [deleteActionCopy(failed).menuItemLabel, 'card__menuitem']],
    'Open in browser is only for a running site');
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
  // Start is not offered: `tovu serve` on a folder that is not there can only fail.
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
  assert.equal(busy.getAttribute('aria-busy'), 'true', 'the ⏻ pulses while it is busy');
  assert.equal(busy.dataset.tooltip, 'Starting…');
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
  assert.equal(panel.parentElement, card, 'the panel adds no wrapper of its own to the card');
  assert.equal(card!.querySelectorAll('.card__confirm[role="group"]').length, 1);
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
  assert.equal(panel.querySelector('.card__confirmtitle')!.textContent, confirm.confirmTitle);
  assert.equal(panel.querySelector('.card__confirmbody code')?.textContent, 'npm run dev', 'backticked text renders as <code>');
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
  // Main's refusal verbatim, never paraphrased: every message it raises names the fix ("remove this
  // card and add the site again from its new location"), and rewording it would drop exactly that half.
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
  assert.ok(host.querySelector('svg.jini-site-card__placeholder'), 'no bridge, no capture: the placeholder');
});

// ---- Layout and wiring the source-text tests used to pin, now asserted on the rendered card ----

test('every control sits in the card body: the head reads name, ⋮, SQLite, status; the button row follows it', (t) => {
  // The owner's layout after four rounds (2026-10-06): the ⋮ level with the name, "SQLite" under the
  // name and the status under the ⋮, then Start/Stop at the left of its own row with Restart on that
  // same row at the right edge. The column/row shapes are CSS (`site-card-actions-wiring.test.ts`);
  // what the DOM owns is where each control is and the order it is in.
  const grid = renderGrid(t, [site('/sites/a')]);
  const [card] = grid.cards();
  assert.equal(card!.querySelector('.jini-site-card__tile')!.querySelectorAll('button, .card__menu').length, 0, 'no action control may sit on the screenshot');
  const head = card!.querySelector('.jini-site-card__body > .jini-site-card__head')!;
  // Grid auto-placement fills row 1 then row 2, so the DOM order IS the layout — and the reading and
  // Tab order, which is why the ⋮ comes second rather than last.
  assert.deepEqual([...head.children].slice(0, 4).map((child) => child.className), ['jini-site-card__namewrap', 'jini-site-card__menu', 'jini-site-card__details', 'jini-site-card__meta']);
  assert.equal(card!.querySelector('.card__info'), null, 'the old left-hand text column is gone');
  const actions = card!.querySelector('.jini-site-card__body > .jini-site-card__actions')!;
  assert.equal(head.nextElementSibling, actions, 'the button row sits under the head');
  assert.equal(actions.getAttribute('role'), 'group');
  assert.equal(actions.getAttribute('aria-label'), 'Actions for Bakery', 'the row is a labelled group, not a bare div with handlers on it');
  assert.deepEqual([...actions.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')), ['Start Bakery', 'Restart Bakery'],
    'the ⋮ no longer lives in the button row, and Start/Stop renders before Restart');
  assert.ok(grid.button(card!, 'Restart Bakery').classList.contains('card__restart'));
  assert.equal(card!.querySelector('h3.jini-site-card__name')!.getAttribute('title'), 'Bakery', 'D-28: a card name exposes its full text');
  assert.equal(card!.querySelector('.card__missing'), null, 'a present folder shows no missing-folder line');
});

test('no standalone trash control exists — with the menu closed the card offers only the pin, ⋮, Start/Stop and Restart', (t) => {
  // The owner's requirement, reversing the earlier "trash always visible" layout: their reason is
  // misclicks, a destructive control beside a button pressed often. Delete lives only inside the ⋮.
  const grid = renderGrid(t, [site('/sites/a', { deleteErasesFiles: true }), site('/sites/b', { status: 'running', port: 4321, displayName: 'Other' })]);
  const names = grid.cards().map((card) => [...card.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')));
  assert.deepEqual(names, [
    ['Pin Bakery', 'More actions for Bakery', 'Start Bakery', 'Restart Bakery'],
    ['Pin Other', 'More actions for Other', 'Stop Other', 'Restart Other'],
  ]);
  assert.equal(grid.host.querySelectorAll('.card__delete').length, 0);
});

test('the tile shows the capture usePreview returns for the card\'s own id and version, as decoration, never the port', (t) => {
  // REGRESSION: owner 2026-10-13 — "where it says 3000" there should be a preview, never the port.
  const fakes = fakeHooks();
  const asked: { id: string; previewVersion: number | null }[] = [];
  fakes.hooks.usePreview = (input) => { asked.push(input); return input.id === '/sites/live' ? 'blob:capture' : null; };
  const grid = renderGrid(t, [site('/sites/live', { status: 'running', port: 3000, previewVersion: 7 }), site('/sites/idle', { port: 3001 })], fakes);
  // These fixtures tie on date and name, so the list's last tiebreak, the id, decides the order.
  assert.deepEqual(asked.slice(0, 2), [{ id: '/sites/idle', previewVersion: null }, { id: '/sites/live', previewVersion: 7 }]);
  const [idle, live] = grid.cards().map((card) => card.querySelector('.jini-site-card__tile')!);
  // An empty alt is deliberate here (not a missing one): a screen-reader user already has the card's
  // own name and status text right below the tile, and announcing "image" or a fabricated
  // description of a screenshot the operator cannot act on would be noise, not information.
  assert.equal(live!.querySelector('img.jini-site-card__preview')!.getAttribute('alt'), '');
  assert.ok(idle!.querySelector('svg.jini-site-card__placeholder'));
  // The shared card marks the whole tile as decoration, so the picture and the placeholder both are.
  assert.deepEqual([live!.getAttribute('aria-hidden'), idle!.getAttribute('aria-hidden')], ['true', 'true']);
  assert.deepEqual([live!.textContent, idle!.textContent], ['', ''], 'the tile must not fall back to the port');
});

test('a card wears the status the power hook decided, not the polled one, and its menu follows it', (t) => {
  // `status`, not `project.status`: the class carries the status the card is actually RENDERING,
  // which during this window's own start or stop is the transition rather than the polled record.
  // See `use-site-power.hooks.ts`, and `.card.is-stopping` in `app.css`.
  const fakes = fakeHooks();
  fakes.state.statuses['/sites/live'] = 'stopping';
  const project = site('/sites/live', { status: 'running', port: 4321 });
  const grid = renderGrid(t, [project], fakes);
  const [card] = grid.cards();
  assert.match(card!.className, /\bis-stopping\b/);
  assert.equal(card!.querySelector('.jini-site-card__status')!.textContent, STATUS_LABEL.stopping);
  const stop = grid.button(card!, 'Stopping… Bakery');
  assert.equal(stop.disabled, true, 'a busy control must be inert, not merely dimmed');
  assert.equal(stop.getAttribute('aria-busy'), 'true');
  assert.equal(stop.dataset.tooltip, 'Stopping…');
  assert.ok(stop.classList.contains('button--create'), 'still on while it stops: the accent fill');
  grid.click(grid.button(card!, 'More actions for Bakery'));
  // An entry that is present but inert teaches the operator that this menu's items sometimes do
  // nothing — and a running-only entry decided from the polled record would still be offering a
  // port that this window's own in-flight Stop is closing.
  assert.deepEqual([...card!.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim()),
    ['Rename…', 'Hide from list', deleteActionCopy(project).menuItemLabel]);
});

test('a site another app serves gets a ⏻ only when Tovu knows how to stop it', (t) => {
  const fakes = fakeHooks();
  fakes.state.withRestart = false;
  const plain = site('/sites/ext', { status: 'stopping', externalUrl: 'https://localhost:4200/admin/' });
  const dev = site('/sites/dev', { status: 'running', externalUrl: 'http://localhost:3000/admin/', externalLauncher: 'npm-run-dev' });
  const grid = renderGrid(t, [plain, dev], fakes);
  // These fixtures tie on date and name, so the list's last tiebreak, the id, decides the order.
  const [own, ext] = grid.cards();
  assert.equal(ext!.querySelector('button.card__power'), null, 'external servers cannot offer a power action, mid-stop either');
  grid.click(grid.button(own!, 'Stop Bakery'));
  assert.deepEqual(grid.calls, ['toggle /sites/dev'], 'an npm run dev site keeps its Stop, which goes to the power hook');
});

test('a Restart in flight reads Restarting…, pulses and cannot be pressed again', (t) => {
  const fakes = fakeHooks();
  const project = site('/sites/a', { status: 'running', port: 4321 });
  fakes.state.restart = restartControl({ project, status: 'starting', restarting: true }, { locale: 'en' });
  const grid = renderGrid(t, [project], fakes);
  const restart = grid.button(grid.cards()[0]!, 'Restarting… Bakery');
  assert.equal(restart.dataset.tooltip, 'Restarting…');
  assert.equal(restart.getAttribute('aria-busy'), 'true');
  assert.equal(restart.disabled, true);
  grid.click(restart);
  assert.deepEqual(grid.calls, []);
});

test('Start opens through the grid\'s own onOpen, and main\'s refreshed records reach onSiteUpdated', (t) => {
  // Start opens the site once it is running through the very `onOpen` a card click calls — no
  // second open path. And `onSiteUpdated` could be correct upstream and simply never handed to the
  // power and locate hooks; the only symptom would be a card four seconds stale.
  const fakes = fakeHooks();
  const realPower = fakes.hooks.usePower!;
  const realLocate = fakes.hooks.useLocate!;
  const powerArgs: Parameters<NonNullable<GridProps['usePower']>>[] = [];
  const locateArgs: Parameters<NonNullable<GridProps['useLocate']>>[] = [];
  fakes.hooks.usePower = (...args) => { powerArgs.push(args); return realPower(...args); };
  fakes.hooks.useLocate = (...args) => { locateArgs.push(args); return realLocate(...args); };
  const onSiteUpdated = () => {};
  const grid = renderGrid(t, [site('/sites/a')], fakes, { onSiteUpdated });
  const [updated, options] = powerArgs[0]!;
  assert.equal(updated, onSiteUpdated);
  options?.onStarted?.('/sites/a');
  assert.deepEqual(grid.opened, ['/sites/a']);
  assert.equal(locateArgs[0]![0], onSiteUpdated);
});

test('Enter or Space on the card opens it; the same key on anything inside the card does not', (t) => {
  // The defect this originally caught: a control's keydown bubbles to the card's handler, which —
  // unguarded — called `preventDefault()`, cancelling the click the browser was about to synthesize
  // from the key, and opened the project underneath it. Keyboard users could not reach that
  // control's own behaviour at all. `isCardOpenKey` is the guard (`SiteGrid.hooks.test.ts`); the
  // handler carrying it is `cardOpenProps`, spread onto the card. That is TWO hops between the
  // predicate and the DOM, which is why this presses real keys on the rendered card: either hop
  // alone could be correct while the card had no keyboard behaviour at all.
  const grid = renderGrid(t, [site('/sites/a')]);
  const [card] = grid.cards();
  const press = (target: Element, key: string) => act(() => { target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })); });
  press(card!, ' ');
  press(card!, 'Escape');
  assert.deepEqual(grid.opened, ['/sites/a'], 'Space opens, any other key does nothing');
  const name = card!.querySelector('.jini-site-card__name')!;
  press(name, 'Enter');
  press(name, ' ');
  assert.deepEqual(grid.opened, ['/sites/a'], 'a key that bubbles up from inside the card is not the card\'s own key');
});

test('the ⋮ menu keeps its keys to itself, and closes on a press outside it or on Escape', (t) => {
  // The menu stops BOTH clicks and keydowns: the card is a click target AND a keyboard-activated
  // open target, and the delete button once shipped with only the click half. Dismissal is
  // `useDismissibleDropdown`'s, shared with the top nav — a third hand-rolled copy is how a menu
  // becomes a menu bug.
  const grid = renderGrid(t, [site('/sites/a')]);
  const [card] = grid.cards();
  const trigger = grid.button(card!, 'More actions for Bakery');
  // Icon-only, so its accessible name is the aria-label `grid.button` found it by.
  assert.equal(trigger.getAttribute('aria-haspopup'), 'true', 'the same a11y contract SettingsControl uses');
  grid.click(trigger);
  act(() => { trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  act(() => { card!.querySelector('[role="menuitem"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
  assert.deepEqual(grid.opened, [], 'keys inside the menu never open the site underneath it');
  act(() => { document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })); });
  assert.equal(card!.querySelector('[role="menu"]'), null, 'a press outside closes the menu');
  grid.click(trigger);
  act(() => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(card!.querySelector('[role="menu"]'), null, 'Escape closes the menu');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

test('the rename panel makes the card inert, bounds the input, and owns Escape and Enter', (t) => {
  // Both panels are one `overlay` value rather than two booleans precisely so the rename form makes
  // the card inert exactly as the delete confirmation does — see `cardOverlay`'s own doc.
  const fakes = fakeHooks();
  const project = site('/sites/bakery');
  fakes.state.renamingId = project.id;
  const grid = renderGrid(t, [project], fakes);
  const [card] = grid.cards();
  assert.equal(card!.getAttribute('role'), null, 'a card with the rename panel open is not an open target');
  assert.equal(card!.querySelector('.card__menu'), null, 'the ⋮ yields to the panel');
  const input = card!.querySelector<HTMLInputElement>('input.card__renameinput')!;
  // maxLength is the courtesy half; `canSave` reflects the real rule, and `site-config.ts`
  // re-applies it on the other side of the wire regardless.
  assert.equal(input.maxLength, 200);
  // Escape cancels and Enter submits — a text field must own both, or the card interprets them.
  for (const key of ['Escape', 'Enter']) {
    act(() => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })); });
  }
  assert.deepEqual(grid.calls, ['cancel rename', `submit rename ${project.id}`]);
  assert.deepEqual(grid.opened, []);
});

test('delete through the real confirmation hook: the ⋮ entry only asks, Cancel keeps the site, Confirm deletes it', async (t) => {
  // A menu entry makes the confirm no less load-bearing: there is no path from the entry straight
  // to the delete. Driven with the grid's DEFAULT `useDeleteConfirmation`, not a fake.
  const fakes = fakeHooks();
  Reflect.deleteProperty(fakes.hooks, 'useDeleteState');
  const deleted: string[] = [];
  const project = site('/sites/a', { deleteErasesFiles: true });
  const copy = deleteActionCopy(project);
  const grid = renderGrid(t, [project], fakes, { onDelete: async (id) => { deleted.push(id); } });
  const card = () => grid.cards()[0]!;
  const ask = () => {
    grid.click(grid.button(card(), 'More actions for Bakery'));
    grid.click(grid.button(card(), copy.menuItemLabel));
  };
  ask();
  assert.ok(card().querySelector('.card__confirm'), 'the entry opens the confirm panel');
  assert.equal(card().querySelector('[role="menu"]'), null, 'the menu closed first, so it cannot float over the panel');
  assert.deepEqual(deleted, [], 'requesting confirmation cannot delete');
  grid.click(grid.button(card(), 'Cancel'));
  assert.equal(card().querySelector('.card__confirm'), null);
  assert.deepEqual(deleted, [], 'Cancel cannot delete');
  ask();
  await act(async () => { grid.button(card(), copy.confirmButtonLabel).click(); });
  assert.deepEqual(deleted, ['/sites/a']);
});

// --- The list: sort, pins and hidden sites, through the real preferences hook ----------------------

function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  const storage: SiteListStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value); },
  };
  return { storage, saved: () => JSON.parse(items.get(SITE_LIST_STORAGE_KEY) ?? 'null') };
}

/** Sites named after their ids; a higher number is newer. */
function dated(...numbers: number[]) {
  return numbers.map((n) => site(`/sites/s${n}`, { displayName: `S${n}`, createdAt: `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z` }));
}

function renderList(t: TestContext, projects: SiteRecord[], storage: SiteListStorage) {
  const grid = renderGrid(t, projects, fakeHooks(), { useListPrefs: () => useSiteListPrefs(storage) });
  const names = () => grid.cards().map((card) => card.querySelector('h3')!.textContent);
  const chip = (label: RegExp) => [...grid.host.querySelectorAll<HTMLButtonElement>('.jini-site-list-toolbar__view')].find((view) => label.test(view.textContent ?? ''));
  const chooseMenuItem = (name: string, item: string) => {
    const card = grid.cards().find((candidate) => candidate.querySelector('h3')!.textContent === name)!;
    grid.click(grid.button(card, `More actions for ${name}`));
    grid.click(grid.button(card, item));
  };
  return { ...grid, names, chip, chooseMenuItem };
}

test('the default view is the six newest, newest first; All websites shows the rest', (t) => {
  const list = renderList(t, dated(1, 2, 3, 4, 5, 6, 7, 8), memoryStorage().storage);
  assert.deepEqual(list.names(), ['S8', 'S7', 'S6', 'S5', 'S4', 'S3']);
  assert.equal(list.chip(/Recent \+ Pinned/)!.getAttribute('aria-pressed'), 'true');
  list.click(list.chip(/^All websites \(8\)$/)!);
  assert.deepEqual(list.names(), ['S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1']);
});

test('a pin puts the site first, keeps an old site in the default view, never opens the card, and is saved', (t) => {
  const memory = memoryStorage();
  const list = renderList(t, dated(1, 2, 3, 4, 5, 6, 7), memory.storage);
  assert.deepEqual(list.names(), ['S7', 'S6', 'S5', 'S4', 'S3', 'S2']);
  list.click(list.chip(/^All websites/)!);
  const oldest = list.cards().at(-1)!;
  const pin = list.button(oldest, 'Pin S1');
  assert.equal(pin.getAttribute('aria-pressed'), 'false');
  list.click(pin);
  assert.deepEqual(list.opened, [], 'the pin must not also open the card');
  assert.deepEqual(memory.saved(), { sort: 'recent', pinned: ['/sites/s1'], hidden: [] });
  assert.deepEqual(list.names(), ['S1', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2']);
  list.click(list.chip(/Recent \+ Pinned/)!);
  assert.deepEqual(list.names(), ['S1', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2'], 'pinned, plus the six newest');
  const unpin = list.button(list.cards()[0]!, 'Unpin S1');
  assert.equal(unpin.getAttribute('aria-pressed'), 'true');
  list.click(unpin);
  assert.deepEqual(memory.saved().pinned, []);
  assert.deepEqual(list.names(), ['S7', 'S6', 'S5', 'S4', 'S3', 'S2']);
});

test('Hide takes the site off the list and Show in list brings it back, leaving the Hidden view once empty', (t) => {
  const memory = memoryStorage();
  const list = renderList(t, dated(1, 2), memory.storage);
  assert.equal(list.chip(/^Hidden/), undefined, 'no Hidden chip until something is hidden');
  list.chooseMenuItem('S2', 'Hide from list');
  assert.deepEqual(list.names(), ['S1']);
  assert.deepEqual(memory.saved().hidden, ['/sites/s2']);
  assert.ok(list.chip(/^All websites \(1\)$/), 'a hidden site leaves the All count');
  list.click(list.chip(/^Hidden \(1\)$/)!);
  assert.deepEqual(list.names(), ['S2']);
  list.chooseMenuItem('S2', 'Show in list');
  assert.deepEqual(memory.saved().hidden, []);
  assert.deepEqual(list.names(), ['S2', 'S1'], 'showing the last hidden site never strands the person on an empty list');
  assert.equal(list.chip(/Recent \+ Pinned/)!.getAttribute('aria-pressed'), 'true');
  assert.equal(list.chip(/^Hidden/), undefined);
});

test('every site hidden says so and points at Hidden, instead of showing an empty page', (t) => {
  const list = renderList(t, dated(1), memoryStorage().storage);
  const empty = () => list.host.querySelector('.site-list__empty');
  assert.equal(empty(), null);
  list.chooseMenuItem('S1', 'Hide from list');
  assert.equal(empty()!.textContent, 'Every website is hidden. Open Hidden to bring one back.');
  assert.deepEqual(list.names(), []);
  list.click(list.chip(/^Hidden \(1\)$/)!);
  assert.equal(empty(), null);
  assert.deepEqual(list.names(), ['S1']);
});

test('Sort by reorders the list and is saved', (t) => {
  const memory = memoryStorage();
  const projects = [site('/sites/b', { displayName: 'Beta', createdAt: '2026-01-02T00:00:00.000Z' }), site('/sites/a', { displayName: 'Alpha', createdAt: '2026-01-01T00:00:00.000Z' }), site('/sites/c', { displayName: 'Cedar', createdAt: '2026-01-03T00:00:00.000Z' })];
  const list = renderList(t, projects, memory.storage);
  assert.deepEqual(list.names(), ['Cedar', 'Beta', 'Alpha']);
  const select = list.host.querySelector('select')!;
  act(() => { select.value = 'name'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  assert.deepEqual(list.names(), ['Alpha', 'Beta', 'Cedar']);
  assert.equal(memory.saved().sort, 'name');
});
