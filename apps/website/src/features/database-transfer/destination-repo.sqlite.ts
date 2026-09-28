import { eq } from "drizzle-orm";

import { databaseTransferDestinations } from "../../platform/db/schema.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { DatabaseDestinationRecord, DatabaseDestinationRepoPort } from "./destination-store.js";

/**
 * @file The SQLite adapter for {@link DatabaseDestinationRepoPort}: one row per workspace in
 * `database_transfer_destinations`. It moves the sealed quad as opaque text and never opens it.
 */

type Row = typeof databaseTransferDestinations.$inferSelect;

function toRecord(row: Row): DatabaseDestinationRecord {
  return {
    workspaceId: row.workspaceId,
    description: { host: row.host, port: row.port, database: row.databaseName, user: row.userName },
    sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
    aadVersion: row.aadVersion,
    savedAt: row.savedAt,
    lastRunJson: row.lastRunJson,
  };
}

export class SqliteDatabaseDestinationRepo implements DatabaseDestinationRepoPort {
  constructor(private readonly db: ContentDb) {}

  async find(workspaceId: string): Promise<DatabaseDestinationRecord | null> {
    const row = this.db.select().from(databaseTransferDestinations).where(eq(databaseTransferDestinations.workspaceId, workspaceId)).all()[0];
    return row === undefined ? null : toRecord(row);
  }

  /** Replaces the workspace's row, last run included. */
  async upsert(record: DatabaseDestinationRecord): Promise<void> {
    const values = {
      workspaceId: record.workspaceId,
      host: record.description.host,
      port: record.description.port,
      databaseName: record.description.database,
      userName: record.description.user,
      sealedKeyId: record.sealed.keyId,
      sealedCiphertext: record.sealed.ciphertext,
      sealedNonce: record.sealed.nonce,
      sealedAlg: record.sealed.alg,
      aadVersion: record.aadVersion,
      savedAt: record.savedAt,
      lastRunJson: record.lastRunJson,
    };
    this.db.insert(databaseTransferDestinations).values(values).onConflictDoUpdate({ target: databaseTransferDestinations.workspaceId, set: values }).run();
  }

  /** A no-op when the workspace has no row. */
  async setLastRun(workspaceId: string, lastRunJson: string): Promise<void> {
    this.db.update(databaseTransferDestinations).set({ lastRunJson }).where(eq(databaseTransferDestinations.workspaceId, workspaceId)).run();
  }
}
