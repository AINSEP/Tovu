import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from '@jini-ai/db/secrets-vault';
import type { KyselyKernel } from '@jini-ai/db/kernel';
import { schemaErasedKernel } from '#src/platform/db/content-kernel';
import { externalMcpVaultPorts } from './external-mcp-vault.js';
import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import { SqlExternalMcpServerRepo } from "@jini-ai/mcp/federation/hosted/external-mcp-repo";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/**
 * @file The external MCP server store on a site's SQLite `content.db`: {@link
 * SqlExternalMcpServerRepo} (the one Kysely query body, `@jini-ai/mcp/federation/hosted/external-mcp-repo`), kept as a
 * named class so callers can construct it from the content db handle or kernel.
 */
export class SqliteExternalMcpServerRepo extends SqlExternalMcpServerRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    const kernel = contentKernel({ store });
    super({ kernel: { ...schemaErasedKernel({ store: kernel }), query: statement => kernel.query(statement) },
      vaultRepo: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }),
      tables: { servers: 'external_mcp_servers', vault: 'secrets_vault' }, vaultErrors: externalMcpVaultPorts.vaultErrors });
  }
}
