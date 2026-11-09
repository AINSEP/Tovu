import assert from 'node:assert/strict';
import test from 'node:test';
import { runDeployOps } from '../run-ops.js';
import { fixture } from './example-ops-fixture.js';

test('an explicit deployment credential ignores malformed origins on unrelated saved rows', async () => {
  const f = await fixture();
  const repo = f.deps.customCredentialSetRepo;
  const saved = await repo.listByWorkspace({ workspaceId: 'ws' });
  repo.listByWorkspace = async () => [...saved, { ...saved[0]!, id: 'legacy', label: 'legacy', baseUrl: 'not an absolute URL' }];
  const result = await runDeployOps(f.deps, { platform: 'example-host', target: 'shop', credentialLabel: 'ops' }, 'status');
  assert.equal(result.platform, 'example-host');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.example-host.dev/v1/targets/shop/instances');
  await assert.rejects(runDeployOps(f.deps, { platform: 'example-host', target: 'shop' }, 'status'), TypeError);
  assert.equal(f.calls.length, 1);
});
