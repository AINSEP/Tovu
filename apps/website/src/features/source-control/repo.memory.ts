import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { type VaultRepoPort } from "@jini-ai/core/contracts/vault";
import { SourceControlCredentialSetVaultAdapter } from "../vendor-credentials/vault-adapter.js";
import type { SourceControlCredentialSetRepoPort } from "@jini-ai/core/contracts/site/source-control-credentials";
import type { CredentialProjectHalf } from "@jini-ai/integrations/vendor-credentials/project-scope";

/** The same host DTO mapping over Jini's memory adapter; no second default/CAS lifecycle. */
export class InMemorySourceControlCredentialSetRepo extends SourceControlCredentialSetVaultAdapter implements SourceControlCredentialSetRepoPort {
  readonly project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort>;
  /** @param optional.project The project store this site's rows fall back to (`types.ts`). */
  constructor({ vault = new InMemoryVaultRepo({}) }: { vault?: VaultRepoPort } = {}, optional: { project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort> } = {}) {
    super({ vault, kind: "source-control" });
    if (optional.project) this.project = optional.project;
  }
}
