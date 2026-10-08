import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { DatabaseDestinationRecord, DatabaseDestinationRepoPort } from "./destination-store.js";

/**
 * @file {@link DatabaseDestinationRepoPort} on the content kernel, one query body for every dialect:
 * one row per workspace in `database_transfer_destinations`. It moves the sealed quad as opaque
 * text and never opens it. `last_run_json` is JSON text on both dialects (`@jini-ai/db/core`).
 */

type Row = {
  workspace_id: string;
  host: string;
  port: string;
  database_name: string;
  user_name: string;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  aad_version: number;
  saved_at: string;
  last_run_json: string | null;
};

function toRecord(row: Row): DatabaseDestinationRecord {
  return {
    workspaceId: row.workspace_id,
    description: { host: row.host, port: row.port, database: row.database_name, user: row.user_name },
    sealed: { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg },
    aadVersion: Number(row.aad_version),
    savedAt: row.saved_at,
    lastRunJson: row.last_run_json,
  };
}

export class DatabaseDestinationRepo implements DatabaseDestinationRepoPort {
  private readonly kernel: ContentKernel;

  /** @param store - the content kernel, or the SQLite content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    this.kernel = contentKernel(store);
  }

  async find(workspaceId: string): Promise<DatabaseDestinationRecord | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("database_transfer_destinations").selectAll().where("workspace_id", "=", workspaceId).executeTakeFirst()
    );
    return row === undefined ? null : toRecord(row);
  }

  /** Replaces the workspace's row, last run included. */
  async upsert(record: DatabaseDestinationRecord): Promise<void> {
    const values: Row = {
      workspace_id: record.workspaceId,
      host: record.description.host,
      port: record.description.port,
      database_name: record.description.database,
      user_name: record.description.user,
      sealed_key_id: record.sealed.keyId,
      sealed_ciphertext: record.sealed.ciphertext,
      sealed_nonce: record.sealed.nonce,
      sealed_alg: record.sealed.alg,
      aad_version: record.aadVersion,
      saved_at: record.savedAt,
      last_run_json: record.lastRunJson,
    };
    const { workspace_id: _key, ...update } = values;
    await this.kernel.run((db) =>
      db
        .insertInto("database_transfer_destinations")
        .values(values)
        .onConflict((conflict) => conflict.column("workspace_id").doUpdateSet(update))
        .execute()
    );
  }

  /** A no-op when the workspace has no row. */
  async setLastRun(workspaceId: string, lastRunJson: string): Promise<void> {
    await this.kernel.run((db) =>
      db.updateTable("database_transfer_destinations").set({ last_run_json: lastRunJson }).where("workspace_id", "=", workspaceId).execute()
    );
  }
}
