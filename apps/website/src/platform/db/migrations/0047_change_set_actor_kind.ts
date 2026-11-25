import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0047: nullable `actor_kind` column on `change_sets` (P10-H2.T).
 *
 * The kind of the actor a change set is attributed to — `user`, `agent` or `system`, as stamped by
 * the trusted writer at host composition (`MutationActor.kind` in `@jini-ai/core/contracts/events`).
 * The same owner editing in the admin and through the assistant share one `actor_id`; only this
 * column tells the two apart. NULL means "recorded before provenance existed": unknown, never guessed
 * from the actor id.
 *
 * Additive and O(1): nullable, no default, no row rewrite, no backfill. Every existing row stays
 * NULL. Existing outbox JSON needs no rewrite: events without an `actor` read as unknown too.
 * Portable DDL for SQLite and Postgres, shared with the fresh-database bootstrap. Added as an
 * ADR-066 step: the Drizzle chain is frozen.
 */
export const CHANGE_SET_ACTOR_KIND_ID = "0047_change_set_actor_kind";

export const CHANGE_SET_ACTOR_KIND_STATEMENTS = [
  "ALTER TABLE change_sets ADD COLUMN actor_kind text",
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of CHANGE_SET_ACTOR_KIND_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example changeSetActorKind({ checksum: pinnedChecksum }) */
export function changeSetActorKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: CHANGE_SET_ACTOR_KIND_ID, checksum: required.checksum, up };
}
