import { SecretsVaultService } from '@jini-ai/platform/secrets/credential-sets';
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from '@jini-ai/db/secrets-vault';
import type { StorageKernel } from '@jini-ai/db/kernel';
import type { KeyringPort, SecretSealerPort } from '@jini-ai/platform/secrets';
import type { ContentDatabase } from '../../../../platform/db/content-database.generated.js';
import { SqlSettingsRepo } from '../../../settings/repo.js';
import { loadSiteVaultKinds } from '../../../../server/runtime/composition/vault-boot.js';

/** Fixture for proving portable exports exclude real saved rows. No production archive reader exists. */
export async function createSavedKeysStore(required: { kernel: StorageKernel<ContentDatabase>; workspaceId: string; keyring: KeyringPort; sealer: SecretSealerPort }) {
  const repo = new SqlSecretsVaultRepo({ kernel: required.kernel as unknown as StorageKernel<SecretsVaultDatabase> });
  const { metaParsers } = await loadSiteVaultKinds({ workspaceId: required.workspaceId });
  const vault = new SecretsVaultService({ ...required, repo, metaParsers, authorize: async () => {}, now: () => '2026-11-04T00:00:00.000Z', newId: () => 'fixture' });
  return { workspaceId: required.workspaceId, vault, repo, settings: new SqlSettingsRepo(required.kernel) };
}
