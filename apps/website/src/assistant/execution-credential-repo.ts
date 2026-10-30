import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "../platform/db/kernel/port.js";
import type { ContentKernel } from "../platform/db/content-kernel.js";
import { InMemoryAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-store.memory";

/** Jini owns the single SQL query body, writer lock and CAS on every dialect. */
export class SqlAdminExecutionCredentialRepo extends InMemoryAdminExecutionCredentialRepo {
  constructor(kernel: ContentKernel) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }) });
  }
}
