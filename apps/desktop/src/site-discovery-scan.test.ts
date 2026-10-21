/** The discovery worker's scan contract, without a thread: results and failures are both plain messages. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runDesktopDiscovery } from './site-discovery-scan.ts';
import type { DesktopDiscoveryInput } from './site-discovery.ts';

const input: DesktopDiscoveryInput = { statePath: '/unused', workspaceOptions: { env: {} } };

test('a scan returns its found folders', () => {
  assert.deepEqual(runDesktopDiscovery({ input }, { discover: (received) => (assert.equal(received, input), ['/sites/a']) }), { found: ['/sites/a'] });
});

test('a failed scan becomes an error message, whether it threw an Error or any other value', () => {
  assert.deepEqual(runDesktopDiscovery({ input }, { discover: () => { throw new Error('Sites folder is too broad: /.'); } }), { error: 'Sites folder is too broad: /.' });
  assert.deepEqual(runDesktopDiscovery({ input }, { discover: () => { throw 'volume unmounted'; } }), { error: 'volume unmounted' });
});
