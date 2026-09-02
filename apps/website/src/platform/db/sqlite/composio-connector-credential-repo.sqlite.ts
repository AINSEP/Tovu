import { and, eq } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";

import type {
  ConnectorCredentialRepoPort,
  ConnectorCredentialRow,
} from "../../connectors/connector-credential-store.js";
import { composioConnectorCredentials } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `ConnectorCredentialRepoPort` adapter — the ADR-006 rule-of-two "second adapter" half;
 * `connectors/connector-credential-store.memory.ts` is the first. Same shape as
 * `media-provider-credential-repo.sqlite.ts`, over this table's `(workspace_id, connector_id)` key.
 *
 * `sealed*` moves in and out as one opaque group; this file never inspects the ciphertext or the
 * credential shape inside it (that is `AesGcmSecretSealer`'s and `connector-credential-store.ts`'s
 * job).
 */

type Row = typeof composioConnectorCredentials.$inferSelect;

function toRow(row: Row): ConnectorCredentialRow {
  const sealed =
    row.sealedKeyId !== null &&
    row.sealedCiphertext !== null &&
    row.sealedNonce !== null &&
    row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    connectorId: row.connectorId,
    accountLabel: row.accountLabel,
    sealed,
    aadVersion: row.aadVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteConnectorCredentialRepo implements ConnectorCredentialRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByWorkspaceId(workspaceId: UUID): Promise<ConnectorCredentialRow[]> {
    return this.db
      .select()
      .from(composioConnectorCredentials)
      .where(eq(composioConnectorCredentials.workspaceId, workspaceId))
      .all()
      .map(toRow);
  }

  async upsert(row: ConnectorCredentialRow): Promise<void> {
    const values = {
      workspaceId: row.workspaceId,
      connectorId: row.connectorId,
      accountLabel: row.accountLabel,
      sealedKeyId: row.sealed?.keyId ?? null,
      sealedCiphertext: row.sealed?.ciphertext ?? null,
      sealedNonce: row.sealed?.nonce ?? null,
      sealedAlg: row.sealed?.alg ?? null,
      aadVersion: row.aadVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    this.db
      .insert(composioConnectorCredentials)
      .values(values)
      .onConflictDoUpdate({
        target: [composioConnectorCredentials.workspaceId, composioConnectorCredentials.connectorId],
        set: values,
      })
      .run();
  }

  async deleteByConnectorId(input: { workspaceId: UUID; connectorId: string }): Promise<void> {
    this.db
      .delete(composioConnectorCredentials)
      .where(
        and(
          eq(composioConnectorCredentials.workspaceId, input.workspaceId),
          eq(composioConnectorCredentials.connectorId, input.connectorId)
        )
      )
      .run();
  }
}
