import { SOURCE_CONTROL_CREDENTIAL_DEPS } from "#src/features/source-control/store";
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDefaultForSourceControl, findDefaultSourceControlCredential } from '@jini-ai/devops/source-control/site/store';

test('canonical API key binding wins over stale source-control copies and revocation has no fallback', async () => {
  let granted = true;
  let legacyReads = 0;
  const token = ['fixture', 'shared', 'token'].join('-');
  const repo = {
    canonical: {
      supports: () => true,
      describe: async () => granted ? { id: 'one-owner-entry', label: 'Repository key', providerId: 'github' } : null,
      resolve: async () => granted ? { id: 'one-owner-entry', label: 'Repository key', connection: { providerId: 'github', token } } : null,
    },
    listByProvider: async () => { legacyReads++; throw new Error('must not read a stale copy'); },
  };
  const deps = { repo, sealer: {} } as never;
  assert.equal((await findDefaultSourceControlCredential({ ...deps, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: 'workspace-local', providerId: 'github' }))?.id, 'one-owner-entry');
  assert.equal((await resolveDefaultForSourceControl({ ...deps, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: 'workspace-local', providerId: 'github' }))?.connection.token, token);
  granted = false;
  assert.equal(await resolveDefaultForSourceControl({ ...deps, deps: SOURCE_CONTROL_CREDENTIAL_DEPS }, { workspaceId: 'workspace-local', providerId: 'github' }), null);
  assert.equal(legacyReads, 0);
});
