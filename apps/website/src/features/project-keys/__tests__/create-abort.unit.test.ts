import assert from 'node:assert/strict';
import test from 'node:test';
import { abortGuardedCredentialRepo } from '../../vendor-credentials/abort-guarded-repo.js';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { vaultRow } from './helpers.js';

test('cancellation after sealing cannot persist through the separate owner-create port', async () => {
  const vault = new InMemoryVaultRepo({});
  const controller = new AbortController();
  const repo = abortGuardedCredentialRepo({ signal: controller.signal, store: { vault,
    project: { repo: { vault }, createRepo: { vault } } } });
  controller.abort();
  await assert.rejects(async () => repo.project.createRepo.vault.put({ record: vaultRow(), expectedRevision: null }));
  assert.equal(await vault.find({ workspaceId: 'project', id: 'key-a' }), null);
});
