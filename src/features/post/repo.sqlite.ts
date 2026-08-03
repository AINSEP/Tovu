import { and, eq } from "drizzle-orm";

import type { JsonObject } from "../../core/ports";
import { posts } from "../../db/schema";
import type { ContentDb } from "../../db/sqlite/content-db";
import { findOneBy } from "../../db/sqlite/repo-helpers";
import type { PostKind, PostRecord, PostRepoPort, PostStatus } from "./post";
import { toPostSearchDocument } from "./search";
import { indexPostSearchDocument } from "./search-index.sqlite";

/**
 * @file Drizzle/SQLite post repository adapter.
 *
 * Satisfies the same `PostRepoPort` as `repo.memory.ts` (slices unchanged). `bodyJson`
 * is stored as JSON text and parsed on read. Queries are typed against the shared
 * `posts` schema, so a Postgres adapter can reuse the same query shapes.
 *
 * SPEC-005 (T021): `ext` is stored the same way `bodyJson` already is — JSON text in, parsed
 * object out. Its column is `NOT NULL DEFAULT '{}'`, so every pre-feature row reads back as "no
 * plugin has written anything" with zero backfill; an empty bag is normalized to an absent `ext`
 * on the record so an entry with no contributing plugin carries no `ext` at all (AC-14).
 *
 * SEARCH INDEX: `save()` — and only `save()` — also refreshes this post's row in the durable FTS5
 * index (migration 0022). That is the whole sync obligation, because `title`/`slug`/`bodyJson` are
 * the only indexed values and this is their only writer. `softDelete()` deliberately does NOT touch
 * the index; a trashed post is excluded by `searchPostIndex`'s own `deleted_at IS NULL` filter
 * against the live row, which is also what makes a later restore searchable again with no extra
 * step. See `search-index.sqlite.ts`'s header for why the visibility fields are query-time filters
 * rather than indexed columns.
 */
type PostRow = typeof posts.$inferSelect;

/** `{}` (the column default, and every pre-SPEC-005 row) reads back as no `ext` at all — AC-14. */
function parseExt(rawExt: string): JsonObject | undefined {
  const parsed = JSON.parse(rawExt) as JsonObject;
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function toRecord(row: PostRow): PostRecord {
  const ext = parseExt(row.ext);
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
    deletedAt: row.deletedAt ?? null,
    ...(ext !== undefined ? { ext } : {}),
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
    const row = {
      ...record,
      bodyJson: JSON.stringify(record.bodyJson),
      seoExtJson: record.seoExtJson ?? null,
      // Persisted from the record like any other field, so `postDeleteReverter`'s restore — which
      // writes a record with `deletedAt: null` through `save()` — actually clears the marker.
      // SETTING a marker still goes through `softDelete` alone (see `PostRepoPort`'s own doc).
      deletedAt: record.deletedAt ?? null,
      ext: JSON.stringify(record.ext ?? {}),
    };
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
          deletedAt: row.deletedAt,
          ext: row.ext,
        },
      })
      .run();

    // Refreshed here rather than by a trigger on `posts`, because the indexed body is plain text
    // walked out of a nested TipTap document — an extraction SQL has no business attempting. This
    // is the only writer of the three indexed columns, so this is the only place the obligation
    // exists (see this file's header).
    indexPostSearchDocument(this.db.$client, toPostSearchDocument(record));
  }

  /**
   * Stamps the trash marker (see `post.ts`'s `PostRecord.deletedAt`) — an UPDATE of three columns,
   * never a `DELETE FROM`. The row survives so `postDeleteReverter` has a pre-image to restore and
   * so `posts_workspace_slug_unique` keeps reserving the trashed row's slug.
   */
  async softDelete(required: {
    workspaceId: string;
    id: string;
    deletedAt: string;
    updatedAt: string;
    version: number;
  }): Promise<void> {
    this.db
      .update(posts)
      .set({ deletedAt: required.deletedAt, updatedAt: required.updatedAt, version: required.version })
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
      .run();
  }
}
