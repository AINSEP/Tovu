import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";
import type { ContentKernel } from "../content-kernel.js";

export class SqlVendorCredentialSetRepo extends VendorCredentialSetVaultRepo {
  constructor(kernel: ContentKernel, _options = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }), kind: "vendor", vendor: true });
  }
}
