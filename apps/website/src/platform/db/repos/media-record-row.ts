import type { Selectable } from "kysely";

import type { MediaTable } from "../content-database.generated.js";
import type { MediaRecord, MediaStatus } from "@jini-ai/cms/media";

/**
 * @file The one stored-row-to-`MediaRecord` mapping every durable media read shares (`SqlMediaRepo`
 * and the bounded grid reads in `media-grid-query.ts`), so a grid page maps rows exactly as `list()`.
 */

/** A stored `media` row as the domain record. @complexity O(1) plus the metadata JSON parse. */
export function toMediaRecord(row: Selectable<MediaTable> & { created_by?: string | null }): MediaRecord {
  return {
    id: row.id,
    // selectAll works on both schemas; absence/NULL is honest legacy unknown attribution.
    ...(row.created_by != null ? { createdBy: row.created_by } : {}),
    workspaceId: row.workspace_id,
    kind: row.kind === "document" ? "document" : "media",
    originalFilename: row.original_filename ?? null,
    title: row.title,
    // `row.slug` is nullable in the DB (see `schema.sqlite.ts`'s doc: backfilled out of band, not on
    // write) but `MediaRecord.slug` is non-nullable in the domain model — every row this repo
    // itself ever writes always has a real slug (`save()`'s values below never omit it), so a `null`
    // here can only mean a genuinely pre-backfill row. Falling back to the row's own `id` rather
    // than `""`/`"untitled"` keeps the fallback ALREADY unique (ids are primary keys) without a
    // repo-layer uniqueness check of its own.
    slug: row.slug ?? row.id,
    alt: row.alt,
    caption: row.caption,
    credit: row.credit,
    source: { sha256: row.source_sha256, ...(row.source_metadata_json ? JSON.parse(row.source_metadata_json) : {}) },
    status: row.status as MediaStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    width: row.width,
    height: row.height,
    cssClass: row.css_class,
    htmlAttributes: row.html_attributes,
    // G7-9: a track needs both the `.vtt` asset and its language; either missing reads as none.
    captions: row.captions_media_id && row.captions_srclang
      ? { assetId: row.captions_media_id, srclang: row.captions_srclang, label: row.captions_label ?? null }
      : null,
    // NULL is "never described" and stays absent; an empty string is an explicit clear and round-trips.
    ...(row.description != null ? { description: row.description } : {}),
  };
}
