import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0045: nullable caption columns on `media` (owner decision G7-9, "optional caption
 * file on media, rendered when present").
 *
 * A video/audio row may name a sibling `.vtt` media row (`captions_media_id`) plus the cue language
 * (`captions_srclang`) and an optional menu label (`captions_label`) — `MediaRecord.captions` in
 * `@jini-ai/cms`. The public renderer resolves the id to that asset's `/m/.../original.vtt` URL.
 * Numbered 0045 because a parallel lane takes 0044.
 *
 * Additive and O(1): nullable, no default, no row rewrite. Every existing row stays NULL, which reads
 * back as "no captions". Portable DDL for SQLite and Postgres, shared with the fresh-database
 * bootstrap. Added as an ADR-066 step: the Drizzle chain is frozen.
 */
export const MEDIA_CAPTIONS_ID = "0045_media_captions";

export const MEDIA_CAPTIONS_STATEMENTS = [
  "ALTER TABLE media ADD COLUMN captions_media_id text",
  "ALTER TABLE media ADD COLUMN captions_srclang text",
  "ALTER TABLE media ADD COLUMN captions_label text",
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of MEDIA_CAPTIONS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example mediaCaptions({ checksum: pinnedChecksum }) */
export function mediaCaptions(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: MEDIA_CAPTIONS_ID, checksum: required.checksum, up };
}
