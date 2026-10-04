import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { performSiteRestart, restartControl } from './use-site-power.hooks.js';
import type { SiteRecord } from '../contracts/project.js';
import { elements, hookHarness, sourceFunction } from './source-test-harness.js';
import { IN_FLIGHT_STATUS, performPowerAction, powerControl } from './use-site-power.hooks.js';
import { desktopCopy } from '../desktop-i18n.js';

const record = { id: '/site', status: 'running' } as SiteRecord;
test('Restart waits for Stop before starting and returns the new record', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const stopped = new Promise<void>(resolve => { release = resolve; });
  const pending = performSiteRestart({ id: record.id, bridge: {
    stopSite: async () => { calls.push('stop'); await stopped; return record; },
    startSite: async () => { calls.push('start'); return record; },
  } });
  assert.deepEqual(calls, ['stop']);
  release();
  assert.equal((await pending).record, record);
  assert.deepEqual(calls, ['stop', 'start']);
});
test('a failed Stop never starts; a failed Start remains actionable; missing bridge is reported', async () => {
  const bridge = { stopSite: async () => { throw new Error('stop failed'); }, startSite: async () => assert.fail('must not start') };
  assert.equal((await performSiteRestart({ id: '/site', bridge })).error, 'stop failed');
  assert.equal((await performSiteRestart({ id: '/site', bridge: { stopSite: async () => record, startSite: async () => { throw new Error('start failed'); } } })).error, 'start failed');
  assert.ok((await performSiteRestart({ id: '/site', bridge: undefined })).error);
});
test('Restart is offered only for running sites with a present folder', () => {
  for (const status of ['running', 'stopped', 'failed', 'starting', 'stopping', 'provisioning', 'blocked'] as const) {
    assert.equal(restartControl({ project: { ...record, status }, status, restarting: false }).disabled, status !== 'running');
  }
  assert.equal(restartControl({ project: { ...record, folderMissing: true }, status: 'running', restarting: false }).disabled, true);
  assert.equal(restartControl({ project: record, status: 'starting', restarting: true }).label, 'Restarting…');
});
test('rapid Restart/Stop clicks share one synchronous guard and clear it after failure', async () => {
  const source = fs.readFileSync(new URL('./use-site-power.hooks.ts', import.meta.url), 'utf8');
  const harness = hookHarness();
  let fail!: (reason: Error) => void;
  let stops = 0;
  const usePower = sourceFunction(source, 'useSitePower', { ...harness.bindings,
    powerControl, performPowerAction, performSiteRestart, restartControl, desktopCopy,
    IN_FLIGHT_STATUS, withoutKey: sourceFunction(source, 'withoutKey'),
    runnerInventoryBridge: () => ({ stopSite: () => { stops++; return new Promise((_r, reject) => { fail = reject; }); }, startSite: async () => record }),
  });
  const firstRender = harness.render(() => usePower());
  const pending = firstRender.restart(record);
  await firstRender.restart(record);
  await firstRender.toggle(record);
  assert.equal(stops, 1);
  assert.equal(harness.render(() => usePower()).restartControlOf(record).label, 'Restarting…');
  fail(new Error('stop failed'));
  await pending;
  assert.equal(harness.render(() => usePower()).errorOf('/site'), 'stop failed');
  assert.equal(harness.render(() => usePower()).statusOf(record), 'running');
});
test('rendered Restart button invokes the hook and is disabled during a transition', () => {
  const source = fs.readFileSync(new URL('./SiteGrid.tsx', import.meta.url), 'utf8');
  const CardActions = sourceFunction(source, 'CardActions', { powerControl, SiteCardMenu: () => null });
  let restarts = 0;
  for (const status of ['running', 'starting'] as const) {
    const power = { toggle: () => {}, restart: () => { restarts++; }, restartControlOf: () => restartControl({ project: record, status, restarting: status === 'starting' }) };
    const tree = CardActions({ project: record, status, power });
    const button = elements(tree).find(e => e.type === 'button' && e.props.children === (status === 'running' ? 'Restart' : 'Restarting…'));
    assert.ok(button);
    assert.equal(button.props.disabled, status !== 'running');
    if (status === 'running') button.props.onClick();
  }
  assert.equal(restarts, 1);
});

test('the stopped record is applied even if the following start fails', async () => {
  const stopped = { ...record, status: 'stopped' } as SiteRecord;
  const updates: SiteRecord[] = [];
  const result = await performSiteRestart({ id: '/site', bridge: {
    stopSite: async () => stopped,
    startSite: async () => { throw new Error('boot failed'); },
  } }, { onStopped: next => updates.push(next) });
  assert.deepEqual(updates, [stopped]);
  assert.equal(result.error, 'boot failed');
});
