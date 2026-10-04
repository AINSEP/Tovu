import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Owner decision 2026-10-04: a form submission's source IP is cleared after 90 days, so the
 * column must accept NULL. SQLite cannot drop NOT NULL in place, so the table is rebuilt with every
 * row, index and trigger preserved; Postgres drops the constraint. Adds the partial index the
 * daily sweep scans (submissions that still hold an IP, oldest first).
 */
export const SUBMISSION_IP_RETENTION_MIGRATION_ID = "0006_submission_ip_retention";

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect === "sqlite") {
    const columns = await kernel.query<{ name: string; notnull: number }>(sql`PRAGMA table_info(form_submissions)`);
    const ip = columns.find(column => column.name === "source_ip");
    if (!ip) throw new Error("form_submissions.source_ip is missing");
    if (ip.notnull !== 0) {
      const expected = ["id", "workspace_id", "form_definition_id", "data_json", "source_ip", "submitted_at", "deleted_at", "version"];
      if (columns.length !== expected.length || columns.some(column => !expected.includes(column.name))) {
        throw new Error("form_submissions schema changed; revise this migration before applying it");
      }
      // Preserve site-added indexes and triggers as well as the shipped definition/workspace
      // indexes. The migration runner holds the lock and supplies the transaction/rollback.
      const objects = await kernel.query<{ sql: string }>(sql`
        SELECT sql FROM sqlite_master WHERE tbl_name = 'form_submissions'
        AND type IN ('index', 'trigger') AND sql IS NOT NULL
      `);
      const tables = await kernel.query<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
      for (const table of tables) {
        const foreignKeys = await kernel.query<{ table: string }>(sql`PRAGMA foreign_key_list(${sql.ref(table.name)})`);
        if (foreignKeys.some(key => key.table === "form_submissions")) {
          throw new Error("form_submissions acquired an incoming foreign key; revise this migration before applying it");
        }
      }
      await kernel.execute(sql`
        CREATE TABLE form_submissions_ip_retention_new (
          id TEXT PRIMARY KEY NOT NULL,
          workspace_id TEXT NOT NULL,
          form_definition_id TEXT NOT NULL REFERENCES form_definitions(id) ON DELETE RESTRICT,
          data_json TEXT NOT NULL,
          source_ip TEXT,
          submitted_at TEXT NOT NULL,
          deleted_at TEXT,
          version INTEGER NOT NULL DEFAULT 1
        )
      `);
      await kernel.execute(sql`
        INSERT INTO form_submissions_ip_retention_new
          (id, workspace_id, form_definition_id, data_json, source_ip, submitted_at, deleted_at, version)
        SELECT id, workspace_id, form_definition_id, data_json, source_ip, submitted_at, deleted_at, version
        FROM form_submissions
      `);
      await kernel.execute(sql`DROP TABLE form_submissions`);
      await kernel.execute(sql`ALTER TABLE form_submissions_ip_retention_new RENAME TO form_submissions`);
      for (const object of objects) await kernel.execute(sql.raw(object.sql));
    }
  } else {
    await kernel.execute(sql`ALTER TABLE form_submissions ALTER COLUMN source_ip DROP NOT NULL`);
  }
  await kernel.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_form_submissions_ip_retention
    ON form_submissions(submitted_at, id) WHERE source_ip IS NOT NULL
  `);
}

export function submissionIpRetentionMigration(
  { checksum }: { checksum: string },
  _optional: Record<string, never> = {},
): MigrationStep {
  return { id: SUBMISSION_IP_RETENTION_MIGRATION_ID, checksum, up };
}
