import { InMemoryVaultRepo, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { TovuCredentialSetVaultAdapter } from "../vendor-credentials/vault-adapter.js";
import type { SourceControlCredentialSetRecord, SourceControlCredentialSetRepoPort } from "./types.js";

/** The same host DTO mapping over Jini's memory adapter; no second default/CAS lifecycle. */
export class InMemorySourceControlCredentialSetRepo extends TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord> implements SourceControlCredentialSetRepoPort {
  constructor({ vault = new InMemoryVaultRepo({}) }: { vault?: VaultRepoPort } = {}, _options = {}) {
    super({ vault, kind: "source-control" });
  }
}
