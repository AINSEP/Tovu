/**
 * @file Coverage for `use-site-power.hooks.ts`'s decision logic — what the card's Start/Stop button
 * says for each of the seven lifecycle statuses, and what one press actually does.
 *
 * `useSitePower` itself calls `useState`, so it cannot be invoked here: this package has no React
 * renderer at all (see `use-site-rename.hooks.test.ts`'s own header). Both decisions it makes are
 * therefore plain exported functions — `powerControl` and `performPowerAction` — and every test
 * below calls one of them directly. The hook's remaining job (hold two maps, clear them) is asserted
 * against source text in `site-card-actions-wiring.test.ts`, which is the only reachable seam.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';

import { IN_FLIGHT_STATUS, codeSpans, externalStopConfirm, performPowerAction, powerControl, powerToggleIntent, runPowerToggle } from './use-site-power.hooks.js';
import { cardOverlay } from './SiteGrid.hooks.js';
import { hookHarness, sourceFunction } from './source-test-harness.js';
import type { SiteRecord } from '../contracts/project.js';

const RECORD = { id: '/sites/a', status: 'running', port: 4321 } as unknown as SiteRecord;

test('toggle intent preserves no-op, synchronous lock and external-stop confirmation precedence', () => {
  const project = { ...RECORD, externalUrl: 'http://localhost:4321', externalLauncher: 'npm-run-dev' as const };
  const inFlight = new Set<string>();
  for (const action of [undefined, null]) {
    assert.equal(powerToggleIntent({ action, project, inFlight, confirmed: false }), null);
  }
  assert.equal(powerToggleIntent({ action: 'stop', project, inFlight, confirmed: false }), 'confirm-stop');
  assert.equal(powerToggleIntent({ action: 'stop', project, inFlight, confirmed: true }), 'stop');
  assert.equal(powerToggleIntent({ action: 'stop', project: RECORD, inFlight, confirmed: false }), 'stop');
  assert.equal(powerToggleIntent({ action: 'start', project, inFlight, confirmed: false }), 'start');
  assert.equal(inFlight.size, 0, 'deciding never acquires a lock');
  inFlight.add(project.id);
  for (const action of ['start', 'stop'] as const) for (const confirmed of [false, true]) {
    assert.equal(powerToggleIntent({ action, project, inFlight, confirmed }), null);
  }
  assert.deepEqual([...inFlight], [project.id], 'deciding never releases the existing lock');
});

test('rapid Start clicks use the synchronous lock and settle updates before opening the site', async () => {
  const source = fs.readFileSync(new URL('./use-site-power.hooks.ts', import.meta.url), 'utf8');
  const harness = hookHarness();
  let resolve!: (record: SiteRecord) => void;
  const calls: string[] = [];
  const usePower = sourceFunction(source, 'useSitePower', { ...harness.bindings,
    powerControl, powerToggleIntent, runPowerToggle, IN_FLIGHT_STATUS, withoutKey: sourceFunction(source, 'withoutKey'),
    runnerInventoryBridge: () => ({ startSite: () => {
      calls.push('start'); return new Promise<SiteRecord>((done) => { resolve = done; });
    } }),
  });
  const project = { ...RECORD, status: 'stopped' as const };
  const render = () => harness.render(() => usePower(
    (record: SiteRecord) => calls.push(`updated:${record.status}`), { onStarted: () => calls.push('open') },
  ));
  const firstRender = render();
  const starting = firstRender.toggle(project);
  await firstRender.toggle(project);
  assert.deepEqual(calls, ['start'], 'an old render closure cannot queue a second Start');
  assert.equal(render().statusOf(project), 'starting');
  resolve(RECORD);
  await starting;
  assert.deepEqual(calls, ['start', 'updated:running', 'open']);
  assert.equal(render().statusOf(project), 'stopped', 'settling drops the local override; main owns the record');
  assert.equal(render().errorOf(project.id), null);
});

// ---------------------------------------------------------------------------------------------
// powerControl
// ---------------------------------------------------------------------------------------------

test('a running site is offered Stop', () => {
  assert.deepEqual(powerControl('running'), { action: 'stop', label: 'Stop', busy: false });
});

test('a stopped site is offered Start', () => {
  assert.deepEqual(powerControl('stopped'), { action: 'start', label: 'Start', busy: false });
});

test('a FAILED site is offered Start, not a disabled button — a failed boot is the one you retry', () => {
  assert.deepEqual(powerControl('failed'), { action: 'start', label: 'Start', busy: false });
});

test('mid-start the button says Starting… and does nothing when pressed', () => {
  const control = powerControl('starting');
  assert.equal(control?.label, 'Starting…');
  assert.equal(control?.action, null, 'a press mid-transition must not queue a second one');
  assert.equal(control?.busy, true);
});

test('mid-stop the button says Stopping… and does nothing when pressed', () => {
  const control = powerControl('stopping');
  assert.equal(control?.label, 'Stopping…');
  assert.equal(control?.action, null);
  assert.equal(control?.busy, true);
});

test('provisioning and blocked get NO button rather than an inert one', () => {
  // A control that is permanently dead teaches an operator that this card's buttons sometimes do
  // nothing, which then applies to the ones that work.
  assert.equal(powerControl('provisioning'), null);
  assert.equal(powerControl('blocked'), null);
});

test('no status produces a label that contradicts its action', () => {
  // The whole contract in one sweep: an actionable control never reads as busy, and a busy one
  // never offers an action.
  for (const status of ['provisioning', 'starting', 'running', 'stopping', 'stopped', 'failed', 'blocked'] as const) {
    const control = powerControl(status);
    if (control === null) continue;
    assert.equal(control.busy, control.action === null, `${status}: busy and action disagree`);
    assert.notEqual(control.label, '', `${status}: a button with no label`);
  }
});

// ---------------------------------------------------------------------------------------------
// performPowerAction
// ---------------------------------------------------------------------------------------------

test("'start' calls startSite and reports main's own record back", async () => {
  const calls: string[] = [];
  const result = await performPowerAction('start', '/sites/a', {
    startSite: async (id) => {
      calls.push(`start:${id}`);
      return RECORD;
    },
    stopSite: async () => assert.fail('stopSite must not be called for a start'),
  });

  assert.deepEqual(calls, ['start:/sites/a']);
  assert.equal(result.record, RECORD, 'the record must be the one main resolved with, not one composed here');
});

test("'stop' calls stopSite, never startSite", async () => {
  const calls: string[] = [];
  const result = await performPowerAction('stop', '/sites/b', {
    startSite: async () => assert.fail('startSite must not be called for a stop'),
    stopSite: async (id) => {
      calls.push(`stop:${id}`);
      return RECORD;
    },
  });

  assert.deepEqual(calls, ['stop:/sites/b']);
  assert.equal(result.record, RECORD, 'stop must propagate the record returned by main');
  assert.equal(result.error, undefined);
});

test('a rejected call surfaces the Error message verbatim rather than re-wrapping it', async () => {
  // Main's refusals name the fix ("tovu serve failed: PORT_IN_USE: …"). A paraphrase here would
  // throw that away at the only place the operator reads it.
  const result = await performPowerAction('start', '/sites/a', {
    startSite: () => Promise.reject(new Error('tovu serve failed: PORT_IN_USE')),
    stopSite: async () => RECORD,
  });

  assert.equal(result.error, 'tovu serve failed: PORT_IN_USE');
  assert.equal(result.record, undefined);
});

test('a non-Error rejection is coerced with String(), not left as [object Object]', async () => {
  const result = await performPowerAction('stop', '/sites/a', {
    startSite: async () => RECORD,
    stopSite: () => Promise.reject('offline'),
  });

  assert.equal(result.error, 'offline');
});

test('no bridge at all is an operator-facing message, not a thrown error', async () => {
  const result = await performPowerAction('start', '/sites/a', undefined);
  assert.equal(result.error, 'The desktop bridge is unavailable.');
});

test('the in-flight status of each action is the lifecycle status of the same name', () => {
  // These two strings are `SiteLifecycleStatus` members that main also produces
  // (`site-transitions.ts`), so a card mid-click and a card mid-drain render identically.
  assert.deepEqual(IN_FLIGHT_STATUS, { start: 'starting', stop: 'stopping' });
});

// ---------------------------------------------------------------------------------------------
// runPowerToggle — what one Start/Stop press does after main answers
// ---------------------------------------------------------------------------------------------

const STOPPED = { ...RECORD, status: 'stopped' } as SiteRecord;
const bridgeResolving = (record: SiteRecord) => ({ startSite: async () => record, stopSite: async () => record });

test('a Start that comes back running opens the site, after the card has the new record', async () => {
  // The owner's ask: Start then a second click on the card was one click too many. Opening goes
  // through the card's own open callback, so the tab is the same one a card click makes.
  const calls: string[] = [];
  const error = await runPowerToggle({ action: 'start', id: '/sites/a', bridge: bridgeResolving(RECORD) }, {
    onSiteUpdated: (record) => calls.push(`updated:${record.status}`),
    onStarted: (id) => calls.push(`open:${id}`),
  });

  assert.equal(error, null);
  assert.deepEqual(calls, ['updated:running', 'open:/sites/a']);
});

test('a failed Start stays on the card: the error is returned and nothing opens', async () => {
  const calls: string[] = [];
  const error = await runPowerToggle({
    action: 'start',
    id: '/sites/a',
    bridge: { startSite: () => Promise.reject(new Error('tovu serve failed: PORT_IN_USE')), stopSite: async () => RECORD },
  }, {
    onSiteUpdated: () => calls.push('updated'),
    onStarted: () => calls.push('open'),
  });

  assert.equal(error, 'tovu serve failed: PORT_IN_USE');
  assert.deepEqual(calls, []);
});

test('a Start whose record does not say running does not open the site', async () => {
  // Opening waits for the site to REPORT running — main's record, not the press.
  const opened: string[] = [];
  const error = await runPowerToggle({ action: 'start', id: '/sites/a', bridge: bridgeResolving(STOPPED) }, {
    onStarted: (id) => opened.push(id),
  });

  assert.equal(error, null);
  assert.deepEqual(opened, []);
});

test('a Stop never opens the site', async () => {
  const opened: string[] = [];
  const updated: SiteRecord[] = [];
  const error = await runPowerToggle({ action: 'stop', id: '/sites/a', bridge: bridgeResolving(RECORD) }, {
    onSiteUpdated: (record) => updated.push(record),
    onStarted: (id) => opened.push(id),
  });

  assert.equal(error, null);
  assert.deepEqual(updated, [RECORD]);
  assert.deepEqual(opened, []);
});

// ---------------------------------------------------------------------------------------------
// Stop for a site another process serves (owner 2026-10-13)
// ---------------------------------------------------------------------------------------------

const DEV_SITE = { id: '/sites/dev', displayName: 'Tovu Dev', status: 'running', port: 3000, runningApp: 'Web',
  externalUrl: 'https://localhost:3000/admin/', externalLauncher: 'npm-run-dev' } as unknown as SiteRecord;

test('an npm run dev site gets the owner\'s confirm copy; another app gets one naming it', () => {
  assert.deepEqual(externalStopConfirm({ project: DEV_SITE }, { locale: 'en' }), {
    confirmTitle: 'Stop Tovu Dev?',
    confirmBody: 'This stops `npm run dev`, including the admin dev server.',
    confirmButtonLabel: 'Stop',
    confirmButtonBusyLabel: 'Stopping…',
    confirmButtonClass: 'button button--primary',
  });
  const other = externalStopConfirm({ project: { ...DEV_SITE, externalLauncher: 'other', runningApp: 'Desktop' } }, { locale: 'en' });
  assert.equal(other?.confirmBody, 'This stops the server running this site in Desktop.');
  assert.equal(externalStopConfirm({ project: { ...DEV_SITE, externalLauncher: 'other', runningApp: undefined } }, { locale: 'en' })?.confirmBody, 'This stops the server running this site in Tovu.');
  assert.equal(externalStopConfirm({ project: { ...DEV_SITE, externalLauncher: undefined } }), null, 'unstoppable: no confirm, and no Stop');
  assert.equal(externalStopConfirm({ project: { ...DEV_SITE, externalUrl: undefined } }), null, 'our own server needs no confirm');
  assert.equal(externalStopConfirm({ project: DEV_SITE }, { locale: 'de' })?.confirmTitle, 'Tovu Dev stoppen?');
});

test('codeSpans renders backticked text as code and drops empty parts', () => {
  assert.deepEqual(codeSpans('This stops `npm run dev`, including it.'), [
    { text: 'This stops ', code: false }, { text: 'npm run dev', code: true }, { text: ', including it.', code: false },
  ]);
  assert.deepEqual(codeSpans('`npm run dev` を停止'), [{ text: 'npm run dev', code: true }, { text: ' を停止', code: false }]);
  assert.deepEqual(codeSpans('plain'), [{ text: 'plain', code: false }]);
});

test('the Stop confirm is its own card overlay; delete still wins a tie', () => {
  assert.equal(cardOverlay('/a', null, null, '/a'), 'stop');
  assert.equal(cardOverlay('/a', '/a', null, '/a'), 'confirm');
  assert.equal(cardOverlay('/a', null, '/a', '/a'), 'stop');
  assert.equal(cardOverlay('/a', null, null, '/b'), null);
  assert.equal(cardOverlay('/a', null, '/a'), 'rename');
});

test('Stop on an external site asks first: only Confirm reaches the bridge, Cancel never does', async () => {
  const source = fs.readFileSync(new URL('./use-site-power.hooks.ts', import.meta.url), 'utf8');
  const harness = hookHarness();
  const stops: string[] = [];
  const usePower = sourceFunction(source, 'useSitePower', { ...harness.bindings,
    powerControl, powerToggleIntent, performPowerAction, runPowerToggle, IN_FLIGHT_STATUS, withoutKey: sourceFunction(source, 'withoutKey'),
    runnerInventoryBridge: () => ({ stopSite: async (id: string) => { stops.push(id); return { ...DEV_SITE, status: 'stopped' }; } }),
  });
  const render = () => harness.render(() => usePower());
  assert.equal(powerControl('running', { external: false })?.action, 'stop', 'a stoppable external site shows the ordinary Stop');
  await render().toggle(DEV_SITE);
  assert.equal(render().confirmingStopId, DEV_SITE.id);
  assert.deepEqual(stops, [], 'the click only opened the confirm');
  render().cancelStop();
  assert.equal(render().confirmingStopId, null);
  assert.deepEqual(stops, []);
  await render().toggle(DEV_SITE);
  await render().confirmStop(DEV_SITE);
  assert.equal(render().confirmingStopId, null);
  assert.deepEqual(stops, [DEV_SITE.id]);
  // An unstoppable external site (no launcher) has no control at all, so a click cannot even ask.
  await render().toggle({ ...DEV_SITE, externalLauncher: undefined });
  assert.equal(render().confirmingStopId, null);
  // Our own site's Stop does not ask.
  await render().toggle({ ...DEV_SITE, id: '/sites/own', externalUrl: undefined, externalLauncher: undefined });
  assert.deepEqual(stops, [DEV_SITE.id, '/sites/own']);
});
