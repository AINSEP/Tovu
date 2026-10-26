import { InMemoryVaultRepo, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { TovuCredentialSetVaultAdapter } from "../vendor-credentials/vault-adapter.js";
import type { SourceControlCredentialSetRecord, SourceControlCredentialSetRepoPort } from "./types.js";
import type { CredentialProjectHalf } from "../vendor-credentials/project-scope.js";

/** The same host DTO mapping over Jini's memory adapter; no second default/CAS lifecycle. */
export class InMemorySourceControlCredentialSetRepo extends TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord> implements SourceControlCredentialSetRepoPort {
  readonly project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort>;
  /** @param optional.project The project store this site's rows fall back to (`types.ts`). */
  constructor({ vault = new InMemoryVaultRepo({}) }: { vault?: VaultRepoPort } = {}, optional: { project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort> } = {}) {
    super({ vault, kind: "source-control" });
    if (optional.project) this.project = optional.project;
  }
}
