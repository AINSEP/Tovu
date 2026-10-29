import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { MediaProviderCredentialVaultRepo } from "#src/features/media/provider-credential-vault";
import type { ContentKernel } from "../../platform/db/content-kernel.js";

/** Thin dialect-independent facade; Jini owns queries, CAS and vault transactions. */
export class SqlMediaProviderCredentialRepo extends MediaProviderCredentialVaultRepo {
  constructor(private readonly kernel: ContentKernel, _options = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }) });
  }

  /** Join the vault writer lock before the synchronous planner reads; every dialect commits the
   * fresh merge and the entire batch together. Crypto preparation stays outside this boundary.
   */
  override async replaceWorkspace(input: Parameters<MediaProviderCredentialVaultRepo["replaceWorkspace"]>[0]) {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`secrets_vault:${input.workspaceId}`);
      return super.replaceWorkspace(input);
    });
  }
}
