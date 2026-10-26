import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { TovuCredentialSetVaultAdapter } from "#src/features/vendor-credentials/vault-adapter";
import type { SourceControlCredentialSetRecord, SourceControlCredentialSetRepoPort } from "#src/features/source-control/types";
import type { CredentialProjectHalf } from "#src/features/vendor-credentials/project-scope";
import type { ContentKernel } from "../content-kernel.js";

/** Thin historical port mapping; Jini owns transactions, defaults, JSON patches and CAS. */
export class SqlSourceControlCredentialSetRepo extends TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord> implements SourceControlCredentialSetRepoPort {
  readonly project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort>;
  /** @param optional.project The project store this site's rows fall back to (`features/source-control/types.ts`). */
  constructor(kernel: ContentKernel, optional: { project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort> } = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }), kind: "source-control" });
    if (optional.project) this.project = optional.project;
  }
}
