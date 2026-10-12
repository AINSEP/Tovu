import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { VaultPublishContentPeerRepo, type PublishContentPeerRepoPort } from "#src/features/publish-content/peers";
import type { ContentKernel } from "../content-kernel.js";
import type { StorageKernel } from "../kernel/port.js";

/** Peer compatibility facade over Jini's single SQL vault adapter, on every dialect. */
export class SqlPublishContentPeerRepo extends VaultPublishContentPeerRepo {
  constructor(kernel: ContentKernel) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> }) });
  }
}

/** Existing composition entrypoint; persistence is owned by Jini. */
export function publishContentPeerRepoFor(kernel: ContentKernel): PublishContentPeerRepoPort {
  return new SqlPublishContentPeerRepo(kernel);
}
