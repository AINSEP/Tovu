import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/** Shared DDL for the async runner and the synchronous fresh-SQLite bootstrap.
 * Unlinked rows retain both keys so an anonymous callback cannot silently relink an account.
 * Provider tokens and email claims deliberately never enter this association table.
 */
export const MEMBER_EXTERNAL_IDENTITIES_STATEMENTS = [
  "CREATE TABLE member_external_identities (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL, member_id text NOT NULL, provider_id text NOT NULL, issuer text NOT NULL, subject text NOT NULL, linked_at text NOT NULL, unlinked_at text)",
  "CREATE UNIQUE INDEX member_external_identities_workspace_subject_unique ON member_external_identities (workspace_id, issuer, subject)",
  "CREATE UNIQUE INDEX member_external_identities_workspace_member_provider_unique ON member_external_identities (workspace_id, member_id, provider_id)",
] as const;

/** Add the association table in the runner's transaction. DDL failures propagate.
 * @complexity O(1) DDL on a new empty table; existing members and credentials are untouched.
 */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of MEMBER_EXTERNAL_IDENTITIES_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Immutable ADR-066 step. @example memberExternalIdentities({ checksum: pinnedChecksum }) */
export function memberExternalIdentities(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: "0035_member_external_identities", checksum: required.checksum, up };
}
