import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { VaultPublishContentPeerRepo } from "#src/features/publish-content/peers";
import type { ContentKernel } from "../content-kernel.js";
import type { StorageKernel } from "../kernel/port.js";

/** Peer compatibility facade over Jini's single SQL vault adapter, on every dialect.
 * Persistence is owned by Jini. */
export class SqlPublishContentPeerRepo extends VaultPublishContentPeerRepo {
  constructor(kernel: ContentKernel) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }) });
  }
}
