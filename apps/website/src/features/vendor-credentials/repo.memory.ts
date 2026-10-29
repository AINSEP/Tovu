import { InMemoryVaultRepo, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { VendorCredentialSetVaultRepo } from "./vault-adapter.js";

export class InMemoryVendorCredentialSetRepo extends VendorCredentialSetVaultRepo {
  constructor({ vault = new InMemoryVaultRepo({}) }: { vault?: VaultRepoPort } = {}, _options = {}) {
    super({ vault, kind: "vendor", vendor: true });
  }
}
