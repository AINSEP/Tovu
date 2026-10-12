import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { TovuCredentialSetVaultAdapter } from "#src/features/vendor-credentials/vault-adapter";
import type { SourceControlCredentialSetRecord, SourceControlCredentialSetRepoPort } from "#src/features/source-control/types";
import type { ContentKernel } from "../content-kernel.js";

/** Thin historical port mapping; Jini owns transactions, defaults, JSON patches and CAS. */
export class SqlSourceControlCredentialSetRepo extends TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord> implements SourceControlCredentialSetRepoPort {
  constructor(kernel: ContentKernel, _options = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }), kind: "source-control" });
  }
}
