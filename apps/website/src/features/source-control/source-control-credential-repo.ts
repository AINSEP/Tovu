import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { TovuCredentialSetVaultAdapter } from "#src/features/vendor-credentials/vault-adapter";
import type { SourceControlCredentialSetRecord, SourceControlCredentialSetRepoPort } from "@jini-ai/core/contracts/site/source-control-credentials";
import type { CredentialProjectHalf } from "@jini-ai/integrations/vendor-credentials/project-scope";
import type { ContentKernel } from "../../platform/db/content-kernel.js";

/** Thin historical port mapping; Jini owns transactions, defaults, JSON patches and CAS. */
export class SqlSourceControlCredentialSetRepo extends TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord> implements SourceControlCredentialSetRepoPort {
  readonly canonical?: import("@jini-ai/core/contracts/site/source-control-credentials").CanonicalSourceControlKeys;
  readonly project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort>;
  /** @param optional.project The project store this site's rows fall back to (`features/source-control/types.ts`). */
  constructor(kernel: ContentKernel, optional: { project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort>; canonical?: import("@jini-ai/core/contracts/site/source-control-credentials").CanonicalSourceControlKeys } = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }), kind: "source-control" });
    this.canonical = optional.canonical;
    if (optional.project) this.project = optional.project;
  }
}
