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

import { IN_FLIGHT_STATUS, performPowerAction, powerControl } from './use-site-power.hooks.js';
import type { SiteRecord } from '../contracts/project.js';

const RECORD = { id: '/sites/a', status: 'running', port: 4321 } as unknown as SiteRecord;

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
