import { sql } from "kysely";
import type { StorageKernel } from "../../kernel/port.js";
import type { MigrationStep } from "../step.js";

/** Project keys are inert until a site explicitly opts in; no existing row is auto-attached. */
export const SITE_KEY_ATTACHMENTS_STATEMENTS = [
  `CREATE TABLE site_key_attachments (
    site_id TEXT NOT NULL, key_id TEXT NOT NULL, site_name TEXT NOT NULL,
    attached_at TEXT NOT NULL, PRIMARY KEY (site_id, key_id)
  )`,
  `CREATE INDEX site_key_attachments_key ON site_key_attachments(key_id)`,
];

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of SITE_KEY_ATTACHMENTS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

export function siteKeyAttachments({ checksum }: { checksum: string }, _optional = {}): MigrationStep {
  return { id: "0002_site_key_attachments", checksum, up };
}
