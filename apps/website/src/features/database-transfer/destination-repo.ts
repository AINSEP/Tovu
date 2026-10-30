import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { StorageKernel } from "../../platform/db/kernel/port.js";

/** The destination uses Jini's CAS/jsonSet SQL adapter; the host owns singleton DDL. */
export class DatabaseDestinationRepo extends SqlSecretsVaultRepo {
  constructor(kernel: ContentKernel, _optional = {}) {
    super({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> });
  }
}
