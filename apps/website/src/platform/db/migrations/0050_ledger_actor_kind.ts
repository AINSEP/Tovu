import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0050: nullable typed-attribution columns on the Trash ledger and the two revision
 * ledgers (H2, owner decision 2026-11-25).
 *
 * `actor_kind` holds one of `RECORDED_ACTOR_KINDS` (`@jini-ai/core/contracts/events`), stamped by the
 * writer when it has a typed actor. `trashed_items` also gains `actor_id`: its existing
 * `actor_principal_id`/`actor_plugin_id` keep their meaning and are never reinterpreted. The revision
 * ledgers already carry a NOT NULL `actor_id`, so only the kind is added; it qualifies that id.
 * `previous_state_json` and `state_json` are domain data, not attribution. The restore ledger gets no
 * column: its typed actor already lives in its detail JSON (check B7).
 *
 * NULL means "written before typed attribution existed, or by a writer without one": unknown, never
 * guessed from an id. No CHECK constraint (the code list owns the vocabulary), no backfill, no row
 * rewrite, no VACUUM: additive and O(1). Portable DDL for SQLite and Postgres, shared with the
 * fresh-database bootstrap. Added as an ADR-066 step: the Drizzle chain is frozen.
 */
export const LEDGER_ACTOR_KIND_ID = "0050_ledger_actor_kind";

export const LEDGER_ACTOR_KIND_STATEMENTS = [
  "ALTER TABLE trashed_items ADD COLUMN actor_kind text",
  "ALTER TABLE trashed_items ADD COLUMN actor_id text",
  "ALTER TABLE taxonomy_revisions ADD COLUMN actor_kind text",
  "ALTER TABLE post_revisions ADD COLUMN actor_kind text",
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of LEDGER_ACTOR_KIND_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example ledgerActorKind({ checksum: pinnedChecksum }, {}) */
export function ledgerActorKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: LEDGER_ACTOR_KIND_ID, checksum: required.checksum, up };
}
