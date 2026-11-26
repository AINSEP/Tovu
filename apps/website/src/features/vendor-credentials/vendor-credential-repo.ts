import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";
import type { VendorCredentialProjectScope } from "@jini-ai/core/contracts/site/vendor-credentials";
import type { ContentKernel } from "../../platform/db/content-kernel.js";

export class SqlVendorCredentialSetRepo extends VendorCredentialSetVaultRepo {
  constructor(kernel: ContentKernel, optional: { project?: VendorCredentialProjectScope } = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }), kind: "vendor", vendor: true }, optional);
  }
}
