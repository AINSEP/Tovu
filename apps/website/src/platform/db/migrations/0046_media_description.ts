import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0046: nullable `description` column on `media` (P10-M5.T).
 *
 * A plain-language account of what the asset shows, written for search — `MediaRecord.description`
 * in `@jini-ai/cms`. A person types it in the admin edit panel, or the assistant saves one through
 * the authorized metadata write tool after viewing an image. NULL means "never described"; an empty
 * string is an explicit clear.
 *
 * Additive and O(1): nullable, no default, no row rewrite, no backfill. Every existing row stays
 * NULL — nothing is fabricated for media nobody has described. Portable DDL for SQLite and
 * Postgres, shared with the fresh-database bootstrap. Added as an ADR-066 step: the Drizzle chain
 * is frozen.
 */
export const MEDIA_DESCRIPTION_ID = "0046_media_description";

export const MEDIA_DESCRIPTION_STATEMENTS = [
  "ALTER TABLE media ADD COLUMN description text",
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of MEDIA_DESCRIPTION_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example mediaDescription({ checksum: pinnedChecksum }) */
export function mediaDescription(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: MEDIA_DESCRIPTION_ID, checksum: required.checksum, up };
}
