import assert from 'node:assert/strict';
import test from 'node:test';
import { activateSiteWithWarmServer } from '../warm-switch.js';

test('switching back to an opened site returns its own URL without restarting the API', async () => {
  const selected: string[] = [];
  const result = await activateSiteWithWarmServer({ switcherBase: '/repo', name: 'other', restartNow: true }, {
    listSites: () => [{ name: 'other', dir: '/sites/other', displayName: 'Other', createdAt: '', active: false }],
    persistActiveSite: ({ name }) => { selected.push(name); },
    warmServer: async () => 'http://localhost:3101/admin/',
    devRestart: { requestRestart: () => assert.fail('warm switch must not restart') },
  });
  assert.equal(result.ok && result.url, 'http://localhost:3101/admin/');
  assert.equal(result.ok && result.restartRequired, false);
  assert.deepEqual(selected, ['other']);
});

test('a failed warm boot warns and uses the existing restart switch', async () => {
  let restarted = false;
  const warnings: string[] = [];
  const result = await activateSiteWithWarmServer({ switcherBase: '/repo', name: 'other', restartNow: true }, {
    listSites: () => [{ name: 'other', dir: '/sites/other', displayName: 'Other', createdAt: '', active: false }],
    persistActiveSite() {}, readSiteRunning: () => null,
    warmServer: async () => { throw new Error('boot failed'); }, warn: message => warnings.push(message),
    devRestart: { requestRestart: () => { restarted = true; } },
  });
  assert.equal(result.ok && result.restarting, true);
  assert.equal(restarted, true);
  assert.equal(warnings.length, 1);
});
