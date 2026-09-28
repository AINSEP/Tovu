import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type { EntryRecord, EntryRevisionInput, EntryStatus } from "./index.js";

/**
 * @file Row mapping for `entries` / `entry_revisions`, shared by every dialect: the columns are the
 * generated `ContentDatabase` types (snake_case, JSON as text). Neutral on purpose — no repo, no
 * driver.
 */

export type EntryRow = Selectable<ContentDatabase["entries"]>;

/** One `entries` row as an {@link EntryRecord}. */
export function toRecord(row: EntryRow): EntryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    slug: row.slug,
    status: row.status as EntryStatus,
    title: row.title,
    bodyJson: row.body_json == null ? null : (JSON.parse(row.body_json) as unknown),
    fieldsJson: JSON.parse(row.fields_json) as unknown,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

/** The insertable `entries` row for `record` (never sets `deleted_at`: only the Trash does). */
export function toRow(record: EntryRecord): Insertable<ContentDatabase["entries"]> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    type: record.type,
    slug: record.slug,
    status: record.status,
    title: record.title,
    body_json: record.bodyJson == null ? null : JSON.stringify(record.bodyJson),
    fields_json: JSON.stringify(record.fieldsJson),
    published_at: record.publishedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    version: record.version,
  };
}

/** The `entry_revisions` row for one audit entry. */
export function toRevisionRow(revision: EntryRevisionInput): Insertable<ContentDatabase["entry_revisions"]> {
  return {
    entry_id: revision.entryId,
    workspace_id: revision.workspaceId,
    op: revision.op,
    state_json: JSON.stringify(revision.stateJson),
    actor_id: revision.actorId,
    delegated_by_workspace_id: revision.delegatedByWorkspaceId,
    delegated_by_id: revision.delegatedById,
    recorded_at: revision.recordedAt,
  };
}
