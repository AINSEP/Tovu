import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import type { CustomCredentialProjectScope } from "#src/features/custom-credentials/types";
import type { ContentKernel } from "../../platform/db/content-kernel.js";

/** Thin dialect-independent facade; Jini owns queries, CAS and vault transactions. */
export class SqlCustomCredentialSetRepo extends CustomCredentialVaultRepo {
  constructor(kernel: ContentKernel, optional: { project?: CustomCredentialProjectScope } = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }) }, optional);
  }
}
