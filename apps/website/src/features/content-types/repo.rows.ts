import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type {
  ContentTypeFieldDef,
  ContentTypeRecord,
  ContentTypeRevisionInput,
  ContentTypeStatus,
} from "./index.js";

/**
 * @file Row mapping for `content_types` / `content_type_revisions`, shared by every dialect: the
 * columns are the generated `ContentDatabase` types (snake_case, JSON as text). Neutral on purpose —
 * no repo, no driver.
 */

export type ContentTypeRow = Selectable<ContentDatabase["content_types"]>;

/** `ContentTypeRecord` has no surrogate id, so the row's primary key is `${workspaceId}::${key}`. */
export function syntheticId(workspaceId: string, key: string): string {
  return `${workspaceId}::${key}`;
}

/** One `content_types` row as a {@link ContentTypeRecord}. */
export function toRecord(row: ContentTypeRow): ContentTypeRecord {
  return {
    workspaceId: row.workspace_id,
    key: row.key,
    label: row.label,
    fields: JSON.parse(row.fields_json) as ContentTypeFieldDef[],
    status: row.status as ContentTypeStatus,
    version: row.version,
    tombstonedAt: row.tombstoned_at,
  };
}

/** `toRecord`'s inverse: the exact column values one whole-row save persists (compact JSON text). */
export function toRow(record: ContentTypeRecord): Insertable<ContentDatabase["content_types"]> {
  return {
    id: syntheticId(record.workspaceId, record.key),
    workspace_id: record.workspaceId,
    key: record.key,
    label: record.label,
    fields_json: JSON.stringify(record.fields),
    status: record.status,
    version: record.version,
    tombstoned_at: record.tombstonedAt ?? null,
  };
}

/** The columns an existing row's save replaces — everything but the match key `id`. */
export function updatableColumns(row: ReturnType<typeof toRow>) {
  return {
    workspace_id: row.workspace_id,
    key: row.key,
    label: row.label,
    fields_json: row.fields_json,
    status: row.status,
    version: row.version,
    tombstoned_at: row.tombstoned_at,
  };
}

/** The `content_type_revisions` row `appendRevision` writes (`seq` is database-assigned). */
export function toRevisionRow(revision: ContentTypeRevisionInput): Insertable<ContentDatabase["content_type_revisions"]> {
  return {
    content_type_key: revision.contentTypeKey,
    workspace_id: revision.workspaceId,
    op: revision.op,
    state_json: JSON.stringify(revision.stateJson),
    actor_id: revision.actorId,
    principal_kind: revision.principalKind,
    delegated_by_workspace_id: revision.delegatedByWorkspaceId,
    delegated_by_id: revision.delegatedById,
    recorded_at: revision.recordedAt,
  };
}
