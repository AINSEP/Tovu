import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { KyselyKernel } from "@jini-ai/db/kernel";

/** The destination uses Jini's CAS/jsonSet SQL adapter; the host owns singleton DDL. */
export class DatabaseDestinationRepo extends SqlSecretsVaultRepo {
  constructor(kernel: ContentKernel, _optional = {}) {
    super({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> });
  }
}
