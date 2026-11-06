import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDaemonSpawnArgs } from '../daemon-supervisor.js';

for (const daemonPath of ['/app/agent-daemon-server.js', '/app/agent-daemon-server.ts']) {
  test(`fallback daemon applies one V8 size flag before ${daemonPath}`, () => {
    const args = buildDaemonSpawnArgs({ daemonPath, workspaceId: 'site-a' });
    assert.equal(args.filter(arg => arg === '--optimize-for-size').length, 1);
    assert.ok(args.indexOf('--optimize-for-size') < args.indexOf(daemonPath));
    assert.deepEqual(args.slice(args.indexOf(daemonPath)), [daemonPath, '--workspace', 'site-a']);
  });
}
