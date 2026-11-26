import type { CanonicalSourceControlKeys } from '@jini-ai/core/contracts/site/source-control-credentials';
import { AesGcmSecretSealer } from '@jini-ai/platform/secrets';
import { InMemoryKeyring } from '../../webhooks/keyring.env.js';
import { InMemorySourceControlCredentialSetRepo } from '../repo.memory.js';
import { SOURCE_CONTROL_CREDENTIAL_DEPS } from "#src/features/source-control/store";
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDefaultForSourceControl, findDefaultSourceControlCredential } from '@jini-ai/devops/source-control/site/store';

test('canonical API key binding wins over stale source-control copies and revocation has no fallback', async () => {
  let granted = true;
  let legacyReads = 0;
  const token = ['fixture', 'shared', 'token'].join('-');
  const input = { workspaceId: 'workspace-local', providerId: 'github' };
  const canonical: CanonicalSourceControlKeys = {
    supports: ({ providerId }) => providerId === 'github',
    describe: async (required) => {
      assert.deepEqual(required, input);
      return granted ? { id: 'one-owner-entry', label: 'Repository key', providerId: 'github' } : null;
    },
    resolve: async (required) => {
      assert.deepEqual(required, input);
      return granted ? { id: 'one-owner-entry', label: 'Repository key', connection: { providerId: 'github', token } } : null;
    },
    list: async () => assert.fail('default reads must not list keys'),
    update: async () => assert.fail('default reads must not update keys'),
    remove: async () => assert.fail('default reads must not remove keys'),
  };
  const repo = Object.assign(new InMemorySourceControlCredentialSetRepo(), { canonical });
  repo.listByProvider = async () => { legacyReads++; throw new Error('must not read a stale copy'); };
  const keyring = new InMemoryKeyring();
  const deps = { repo, sealer: new AesGcmSecretSealer({ keyring }), deps: SOURCE_CONTROL_CREDENTIAL_DEPS };
  assert.equal((await findDefaultSourceControlCredential(deps, input))?.id, 'one-owner-entry');
  assert.equal((await resolveDefaultForSourceControl(deps, input))?.connection.token, token);
  granted = false;
  assert.equal(await resolveDefaultForSourceControl(deps, input), null);
  assert.equal(legacyReads, 0);
});
