import type Database from "better-sqlite3";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { entries, entryRevisions } from "../../platform/db/schema.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import { EntrySlugConflictError } from "./index.js";
import type {
  EntryListPort,
  EntryRecord,
  EntryRepoPort,
  EntryRevisionInput,
  EntryStatus,
} from "./index.js";

/**
 * @file Real SQLite `EntryRepoPort` + `EntryListPort` adapter (ADR-006 rule-of-two "second
 * adapter" half — `repo.memory.ts`'s `InMemoryEntryRepo` is the first). Same disclosed gap
 * closure as `features/content-types/repo.sqlite.ts` — see that file's header for the full
 * rationale, which applies identically here.
 *
 * Architectural role:
 * Infrastructure adapter. ADR-042 item 1: `findBySlug`/`findById` reuse `repo-helpers.ts`'s
 * `findOneBy` rather than hand-rolling the lookup shape.
 *
 * Trash: a row with `deleted_at` set is in the Trash (only widgets get there today). Every read here
 * hides it, so every widget reader — region placements, embeds, the admin list — treats a trashed
 * widget as missing (the REQ-28 placeholder). `save` never writes `deleted_at` and never touches a
 * trashed row; only the Trash moves a row in or out.
 */

/** A row that is not in the Trash. */
const LIVE = isNull(entries.deletedAt);

/** SQLite's own text for the `entries_workspace_type_slug_unique` index. */
const SLUG_UNIQUE_VIOLATION = "UNIQUE constraint failed: entries.workspace_id, entries.type, entries.slug";

function toRecord(row: typeof entries.$inferSelect): EntryRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    slug: row.slug,
    status: row.status as EntryStatus,
    title: row.title,
    bodyJson: row.bodyJson == null ? null : (JSON.parse(row.bodyJson) as unknown),
    fieldsJson: JSON.parse(row.fieldsJson) as unknown,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class SqliteEntryRepo implements EntryRepoPort, EntryListPort {
  constructor(private readonly db: ContentDb) {}

  async findBySlug(params: { workspaceId: string; type: string; slug: string }): Promise<EntryRecord | null> {
    return findOneBy(
      this.db,
      entries,
      [eq(entries.workspaceId, params.workspaceId), eq(entries.type, params.type), eq(entries.slug, params.slug), LIVE],
      toRecord
    );
  }

  async findById(params: { workspaceId: string; id: string }): Promise<EntryRecord | null> {
    return findOneBy(this.db, entries, [eq(entries.workspaceId, params.workspaceId), eq(entries.id, params.id), LIVE], toRecord);
  }

  /**
   * Upserts an `entries` row by id — full-replace semantics, matching `InMemoryEntryRepo.save`'s
   * `Map.set` behavior exactly. A trashed row is left as it is (a stale save cannot bring it back).
   *
   * @throws EntrySlugConflictError when a trashed row holds the slug: the reads above hide it, so the
   *         chokepoint's own slug check could not see it.
   * @complexity O(1).
   */
  async save(row: EntryRecord): Promise<void> {
    const values = {
      id: row.id,
      workspaceId: row.workspaceId,
      type: row.type,
      slug: row.slug,
      status: row.status,
      title: row.title,
      bodyJson: row.bodyJson == null ? null : JSON.stringify(row.bodyJson),
      fieldsJson: JSON.stringify(row.fieldsJson),
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    };
    try {
      this.db.insert(entries).values(values).onConflictDoUpdate({ target: entries.id, set: values, setWhere: LIVE }).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes(SLUG_UNIQUE_VIOLATION)) {
        throw new EntrySlugConflictError(
          `an entry with slug '${row.slug}' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug`
        );
      }
      throw error;
    }
  }

  async appendRevision(revision: EntryRevisionInput): Promise<void> {
    this.db
      .insert(entryRevisions)
      .values({
        entryId: revision.entryId,
        workspaceId: revision.workspaceId,
        op: revision.op,
        stateJson: JSON.stringify(revision.stateJson),
        actorId: revision.actorId,
        delegatedByWorkspaceId: revision.delegatedByWorkspaceId,
        delegatedById: revision.delegatedById,
        recordedAt: revision.recordedAt,
      })
      .run();
  }

  async listByWorkspace(params: {
    workspaceId: string;
    type?: string;
    status?: EntryStatus;
    orderBy?: "updatedAt";
    orderDirection?: "asc" | "desc";
    limit?: number;
  }): Promise<EntryRecord[]> {
    const conditions = [eq(entries.workspaceId, params.workspaceId), LIVE];
    if (params.type) conditions.push(eq(entries.type, params.type));
    if (params.status) conditions.push(eq(entries.status, params.status));

    let query = this.db.select().from(entries).where(and(...conditions)).$dynamic();
    if (params.orderBy === "updatedAt") {
      query = query.orderBy(params.orderDirection === "asc" ? asc(entries.updatedAt) : desc(entries.updatedAt));
    }
    if (typeof params.limit === "number") {
      query = query.limit(params.limit);
    }
    const rows = query.all();
    return rows.map(toRecord);
  }

  /** Manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` — mirrors `SqliteContentTypeRepo.transaction`.
   *  Joins a transaction already open on this connection (the widget adoption runs an entry update
   *  and its Trash move as one). */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = (this.db as unknown as { $client: Database.Database }).$client;
    if (client.inTransaction) return fn();
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
