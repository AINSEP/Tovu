import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { ContentKernel } from "../platform/db/content-kernel.js";
import { InMemorySiteAssistantCredentialRepo } from "#src/assistant/site-credential-store.memory";

/** Jini owns the single SQL query body, writer lock and CAS on every dialect. */
export class SqlSiteAssistantCredentialRepo extends InMemorySiteAssistantCredentialRepo {
  constructor(kernel: ContentKernel) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }) });
  }
}
