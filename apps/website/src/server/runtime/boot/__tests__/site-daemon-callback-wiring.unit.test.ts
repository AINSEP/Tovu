import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildDaemonSpawnEnvOverrides } from '../../lifecycle/daemon-supervisor.js';

test('standalone site daemons keep the public origin and a separate reachable callback origin', () => {
  const input = { workspaceId: 'site-a', siteDir: '/sites/a', daemonPortOverride: '4201',
    siteApiOrigin: 'http://192.168.1.20:4200', siteCallbackOrigin: 'http://127.0.0.1:4202' };
  const result = buildDaemonSpawnEnvOverrides(input);
  assert.equal(result.TOVU_SITE_LISTENER_ORIGIN, input.siteApiOrigin);
  assert.equal(result.TOVU_SITE_CALLBACK_ORIGIN, input.siteCallbackOrigin);
});

for (const entry of ['../../../../index.ts', '../../../../cli/commands/serve.ts']) {
  test(`${entry} supplies and closes the daemon callback listener for LAN-bound sites`, () => {
    const source = readFileSync(new URL(entry, import.meta.url), 'utf8');
    assert.match(source, /await startSiteDaemonListener\(/);
    assert.match(source, /siteCallbackOrigin: daemonCallback\.origin/);
    assert.match(source, /daemonCallback\.close/);
  });
}
