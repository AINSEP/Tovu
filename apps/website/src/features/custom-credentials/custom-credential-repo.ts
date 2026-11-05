import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import type { CustomCredentialProjectScope } from "#src/features/custom-credentials/types";
import type { ContentKernel } from "../../platform/db/content-kernel.js";

/** Thin dialect-independent facade; Jini owns queries, CAS and vault transactions. */
export class SqlCustomCredentialSetRepo extends CustomCredentialVaultRepo {
  constructor(kernel: ContentKernel, optional: { project?: CustomCredentialProjectScope } = {}) {
    const vault = new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> });
    const reader = Object.assign(vault, { findByLabel: async ({ workspaceId, label }: { workspaceId: string; label: string }) => {
      const row = await kernel.run(db => db.selectFrom("secrets_vault").select("id")
        .where("workspace_id", "=", workspaceId).where("label", "=", label)
        .where("owner_key", "=", "tovu").where("principal_id", "is", null)
        .where("kind", "in", ["vendor", "custom"]).where("provider", "is", null).where("binding", "is", null).limit(1).executeTakeFirst());
      return row ? vault.find({ workspaceId, id: row.id }) : null;
    } });
    super({ vault: reader }, optional);
  }
}
