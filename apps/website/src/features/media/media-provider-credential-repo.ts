import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { MediaProviderCredentialVaultRepo } from "@jini-ai/cms/media/site/provider-credential-vault";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { IdGenerator } from "@jini-ai/core/primitives";

const MEDIA_CREDENTIAL_POLICY = { ownerKey: "tovu", legacyIds: { grok: ["xai-grok-imagine"] },
  parseMeta: ({ meta }: { meta: unknown }) => parseTovuStoreMeta({ kind: "media-provider", meta }) as { baseUrl: string | null; model: string | null } };


/** Thin dialect-independent facade; Jini owns queries, CAS and vault transactions. */
export class SqlMediaProviderCredentialRepo extends MediaProviderCredentialVaultRepo {
  private readonly kernel: ContentKernel;
  constructor({ kernel, idGen }: { kernel: ContentKernel; idGen: IdGenerator }, _options = {}) {
    super({ vault: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }), policy: MEDIA_CREDENTIAL_POLICY, idGen });
    this.kernel = kernel;
  }

  /** Join the vault writer lock before the synchronous planner reads; every dialect commits the
   * fresh merge and the entire batch together. Crypto preparation stays outside this boundary.
   */
  override async replaceWorkspace(input: Parameters<MediaProviderCredentialVaultRepo["replaceWorkspace"]>[0]) {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`secrets_vault:${input.workspaceId}`);
      return super.replaceWorkspace(input);
    });
  }
}
