import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0043: a nullable `actor_kind` column on `change_sets` (plan P10-H2).
 *
 * A change set recorded only `actor_id`, and an assistant edit runs as its delegating user's
 * principal, so the audit trail could not tell an agent's mutation from that user's own save.
 * The command envelope's `actor.kind` (`user` | `agent` | `system`) is now stamped on every change
 * set; Jini `@jini-ai/db/events` maps it to this column.
 *
 * No backfill: rows from before this step never recorded who made them, and guessing would put a
 * false claim in the audit trail, so they stay NULL (read back as "unknown"). Additive and O(1) on
 * SQLite and Postgres (a nullable column with no default rewrites no rows). Portable DDL shared with
 * the fresh-database bootstrap. Added as an ADR-066 step: the Drizzle chain is frozen.
 */
export const CHANGE_SETS_ACTOR_KIND_ID = "0043_change_sets_actor_kind";

export const CHANGE_SETS_ACTOR_KIND_SQL = "ALTER TABLE change_sets ADD COLUMN actor_kind text";

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  await kernel.execute(sql.raw(CHANGE_SETS_ACTOR_KIND_SQL));
}

/** Build the immutable ADR-066 step. @example changeSetsActorKind({ checksum: pinnedChecksum }) */
export function changeSetsActorKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: CHANGE_SETS_ACTOR_KIND_ID, checksum: required.checksum, up };
}
