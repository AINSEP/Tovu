import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";

import { contentTypeRevisions, contentTypes } from "../../platform/db/schema.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import type {
  ContentTypeFieldDef,
  ContentTypeListPort,
  ContentTypeRecord,
  ContentTypeRepoPort,
  ContentTypeRevisionInput,
  ContentTypeStatus,
} from "./index.js";

/**
 * @file Real SQLite `ContentTypeRepoPort` + `ContentTypeListPort` adapter (ADR-006 rule-of-two
 * "second adapter" half — `repo.memory.ts`'s `InMemoryContentTypeRepo` is the first). Closes the
 * gap every session of the spec-016-020 workstream disclosed: the `content_types` registry existed
 * fakes-only, with no adapter that actually persists into `content.db`.
 *
 * Purpose:
 * Satisfies the exact same certified ports `repo.memory.ts` does — no port shape changes, only
 * real persistence behind them. `id` is a synthetic `${workspaceId}::${key}` key
 * (`ContentTypeRecord` itself has no surrogate id) so `save()` can upsert by primary key.
 *
 * How it relates to the project:
 * `transaction()` uses the same manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` pattern
 * `SqliteSettingsRepo.transaction` established (`repo.sqlite.ts` under `features/settings`) — see
 * that file's doc comment for why a manual transaction is required instead of Drizzle's
 * `db.transaction()` wrapper (that wrapper requires a synchronous callback; this package's
 * write-service chokepoint does `await`ed repo calls inside its own `transaction()` callback).
 *
 * Architectural role:
 * Infrastructure adapter. ADR-042 item 1: `findByKey`'s single-row workspace-scoped lookup reuses
 * `repo-helpers.ts`'s `findOneBy` rather than hand-rolling the `select().where().limit(1)` shape.
 */

function syntheticId(workspaceId: string, key: string): string {
  return `${workspaceId}::${key}`;
}

function toRecord(row: typeof contentTypes.$inferSelect): ContentTypeRecord {
  return {
    workspaceId: row.workspaceId,
    key: row.key,
    label: row.label,
    fields: JSON.parse(row.fieldsJson) as ContentTypeFieldDef[],
    status: row.status as ContentTypeStatus,
    version: row.version,
    tombstonedAt: row.tombstonedAt,
  };
}

export class SqliteContentTypeRepo implements ContentTypeRepoPort, ContentTypeListPort {
  constructor(private readonly db: ContentDb) {}

  /**
   * Upserts a `content_types` row by its synthetic `(workspaceId, key)` id — full-replace
   * semantics, matching `InMemoryContentTypeRepo.save`'s `Map.set` behavior exactly.
   *
   * @complexity O(1).
   * @overallScore 100
   */
  async save(row: ContentTypeRecord): Promise<void> {
    const id = syntheticId(row.workspaceId, row.key);
    const values = {
      id,
      workspaceId: row.workspaceId,
      key: row.key,
      label: row.label,
      fieldsJson: JSON.stringify(row.fields),
      status: row.status,
      version: row.version,
      tombstonedAt: row.tombstonedAt ?? null,
    };
    this.db
      .insert(contentTypes)
      .values(values)
      .onConflictDoUpdate({ target: contentTypes.id, set: values })
      .run();
  }

  async appendRevision(revision: ContentTypeRevisionInput): Promise<void> {
    this.db
      .insert(contentTypeRevisions)
      .values({
        contentTypeKey: revision.contentTypeKey,
        workspaceId: revision.workspaceId,
        op: revision.op,
        stateJson: JSON.stringify(revision.stateJson),
        actorId: revision.actorId,
        principalKind: revision.principalKind,
        delegatedByWorkspaceId: revision.delegatedByWorkspaceId,
        delegatedById: revision.delegatedById,
        recordedAt: revision.recordedAt,
      })
      .run();
  }

  async findByKey(params: { workspaceId: string; key: string }): Promise<ContentTypeRecord | null> {
    return findOneBy(
      this.db,
      contentTypes,
      [eq(contentTypes.workspaceId, params.workspaceId), eq(contentTypes.key, params.key)],
      toRecord
    );
  }

  async listByWorkspace(params: { workspaceId: string }): Promise<ContentTypeRecord[]> {
    const rows = this.db.select().from(contentTypes).where(eq(contentTypes.workspaceId, params.workspaceId)).all();
    return rows.map(toRecord);
  }

  /**
   * Manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` — see this file's header for why (mirrors
   * `SqliteSettingsRepo.transaction` exactly).
   *
   * @complexity O(1) plus the wrapped callback's own cost.
   * @overallScore 100
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = (this.db as unknown as { $client: Database.Database }).$client;
    client.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      client.exec("COMMIT");
      return result;
    } catch (error) {
      client.exec("ROLLBACK");
      throw error;
    }
  }
}
