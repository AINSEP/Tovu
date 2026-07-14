import { eq } from "drizzle-orm";

import type { JsonObject } from "../../core/ports";
import { posts } from "../../infra/db/schema";
import type { ContentDb } from "../../infra/sqlite/content-db";
import { findOneBy } from "../../infra/sqlite/repo-helpers";
import type { PostKind, PostRecord, PostRepoPort, PostStatus } from "./post";

/**
 * @file Drizzle/SQLite post repository adapter.
 *
 * Satisfies the same `PostRepoPort` as `repo.memory.ts` (slices unchanged). `bodyJson`
 * is stored as JSON text and parsed on read. Queries are typed against the shared
 * `posts` schema, so a Postgres adapter can reuse the same query shapes.
 */
type PostRow = typeof posts.$inferSelect;

function toRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    slug: row.slug,
    bodyJson: JSON.parse(row.bodyJson) as JsonObject,
    status: row.status as PostStatus,
    kind: row.kind as PostKind,
    updatedAt: row.updatedAt,
    version: row.version,
    seoExtJson: row.seoExtJson ?? null,
  };
}

export class SqlitePostRepo implements PostRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<PostRecord | null> {
    return findOneBy(
      this.db,
      posts,
      [eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)],
      toRecord
    );
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    return findOneBy(
      this.db,
      posts,
      [eq(posts.workspaceId, required.workspaceId), eq(posts.slug, required.slug)],
      toRecord
    );
  }

  async list(required: { workspaceId: string }): Promise<PostRecord[]> {
    const rows = this.db.select().from(posts).where(eq(posts.workspaceId, required.workspaceId)).all();
    return rows.map(toRecord);
  }

  async save(record: PostRecord): Promise<void> {
    const row = { ...record, bodyJson: JSON.stringify(record.bodyJson), seoExtJson: record.seoExtJson ?? null };
    this.db
      .insert(posts)
      .values(row)
      .onConflictDoUpdate({
        target: posts.id,
        set: {
          workspaceId: row.workspaceId,
          title: row.title,
          slug: row.slug,
          bodyJson: row.bodyJson,
          status: row.status,
          kind: row.kind,
          updatedAt: row.updatedAt,
          version: row.version,
          seoExtJson: row.seoExtJson,
        },
      })
      .run();
  }
}
