import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { CustomCredentialVaultRepo } from "./vault-repo.js";

/** Memory fixtures use the same CAS, label uniqueness and atomic writes as the Jini vault. */
export class InMemoryCustomCredentialSetRepo extends CustomCredentialVaultRepo {
  constructor(_required = {}, _options = {}) { super({ vault: new InMemoryVaultRepo({}) }); }
}
