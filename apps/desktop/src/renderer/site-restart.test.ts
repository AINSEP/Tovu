/**
 * @file Restart's pure halves — `performSiteRestart` and `restartControl` — run directly. The hook's
 * shared in-flight guard is rendered in `use-site-power.hooks.restart-guard.render.test.ts`, and the
 * card's Restart button (label, tooltip, busy, disabled, click) in `SiteGrid.jsdom.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { performSiteRestart, restartControl } from './use-site-power.hooks.js';
import type { SiteRecord } from '../contracts/project.js';

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
test('Restart\'s tooltip says what it does, or why it is greyed', () => {
  const tip = (status: SiteRecord['status'], restarting = false, project: SiteRecord = record) => restartControl({ project, status, restarting });
  assert.deepEqual([tip('running').tooltip, tip('running').busy], ['Restart site', false]);
  for (const status of ['stopped', 'failed', 'starting', 'stopping'] as const) assert.equal(tip(status).tooltip, 'Start the site first');
  assert.deepEqual([tip('stopping', true).tooltip, tip('stopping', true).busy], ['Restarting…', true]);
  assert.equal(tip('running', false, { ...record, externalUrl: 'https://localhost:4200/admin/' }).tooltip, 'Restart is not available for this site');
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
