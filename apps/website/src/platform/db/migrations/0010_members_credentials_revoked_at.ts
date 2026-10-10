import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/** Same nullable text timestamp as other member timestamps; existing members have no cutoff. */
export const MEMBERS_CREDENTIALS_REVOKED_AT_SQL = "ALTER TABLE members ADD COLUMN credentials_revoked_at text";

/** Adds only the approved credential cutoff. Schema and ledger commit together (ADR-066).
 * @complexity O(1) metadata change; no row rewrite or backfill. */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.execute(sql.raw(MEMBERS_CREDENTIALS_REVOKED_AT_SQL));
}

export function membersCredentialsRevokedAt(required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep {
  return { id: "0010_members_credentials_revoked_at", checksum: required.checksum, up };
}
