import { and, eq } from "drizzle-orm";

import type { JsonObject } from "@jini-ai/cms/core";
import { posts } from "../../platform/db/schema.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import { DEFAULT_BODY_JSON, type PostBodyFormat, type PostKind, type PostRecord, type PostRepoPort, type PostStatus } from "./post.js";
import { toPostSearchDocument } from "./search.js";
import { indexPostSearchDocument } from "./search-index.sqlite.js";

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

/**
 * SPEC-047/ADR-056 Decision 3 — `body_json` is `NULL` for an `"html"`-format row (Pages
 * vibecoding, written by `PagesHtmlDocumentStore`, never by this repo's own `save()`).
 * `PostRecord.bodyJson` stays a required `JsonObject` (unwidened) so the ~15 existing consumers of
 * `PostRecord` (search indexing, SEO excerpting, widget embeds, site rendering, `entry_refs`
 * extraction) do not all need null-handling added in this pass — none of them are reachable for an
 * `"html"` row yet (nothing routes one through `listAdminPosts`/`getPublishedPostBySlug`/etc. until
 * REQ-5's generation tool ships), so `DEFAULT_BODY_JSON` here is an inert placeholder, not a value
 * anything currently reads. `toHeadlessPost` (SPEC-047 REQ-3's discriminated union) is what actually
 * branches on `bodyFormat` and must never surface this placeholder as if it were real content.
 */
function toRecord(row: PostRow): PostRecord {
  const ext = parseExt(row.ext);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    slug: row.slug,
    bodyJson: row.bodyJson === null ? DEFAULT_BODY_JSON : (JSON.parse(row.bodyJson) as JsonObject),
    bodyFormat: row.bodyFormat as PostBodyFormat,
    bodyHtml: row.bodyHtml ?? null,
    status: row.status as PostStatus,
    kind: row.kind as PostKind,
    updatedAt: row.updatedAt,
    version: row.version,
    seoExtJson: row.seoExtJson ?? null,
    deletedAt: row.deletedAt ?? null,
    templateChoice: row.templateChoice ?? null,
    overridesThemePage: row.overridesThemePage,
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
      // The exact inverse of `toRecord`'s `row.bodyJson === null ? DEFAULT_BODY_JSON : parse(...)`
      // substitution, and it has to be, or the pair is not a round trip. `toRecord` hands an
      // `"html"` row a placeholder `bodyJson` (the domain type keeps `bodyJson` a required
      // `JsonObject` — see this file's header for why it stays unwidened), so writing that
      // placeholder back down would populate both body columns at once and the table's CHECK
      // constraint would reject the write outright.
      bodyJson: record.bodyFormat === "html" ? null : JSON.stringify(record.bodyJson),
      // Same guard from the other side: a `"doc"` record must not carry stray html, whatever a
      // caller assembled. The CHECK constraint enforces exactly one populated body column per
      // format; these two lines are what keep every `save()` on the legal side of it.
      bodyHtml: record.bodyFormat === "html" ? record.bodyHtml : null,
      seoExtJson: record.seoExtJson ?? null,
      // Persisted from the record like any other field, so `postDeleteReverter`'s restore — which
      // writes a record with `deletedAt: null` through `save()` — actually clears the marker.
      // SETTING a marker still goes through `softDelete` alone (see `PostRepoPort`'s own doc).
      deletedAt: record.deletedAt ?? null,
      templateChoice: record.templateChoice ?? null,
      // Tri-state (2026-08-15) — `record.overridesThemePage` is `undefined` on every row a caller
      // never set an opinion on (every `createPost` call today: `CreatePostInput` has no field for
      // this, deliberately — see its own doc). Coalescing to `null`, NOT `false`, is the entire fix
      // this migration exists to enable: `false` would silently re-encode "never decided" as
      // "explicitly kept the theme page", exactly the ambiguity `pages.ts`'s resolver can no longer
      // tell apart from a real author choice. `null` stays honestly "undecided" all the way to the
      // resolver, which is the one place the current default policy is allowed to live.
      overridesThemePage: record.overridesThemePage ?? null,
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
          bodyFormat: row.bodyFormat,
          bodyHtml: row.bodyHtml,
          status: row.status,
          kind: row.kind,
          updatedAt: row.updatedAt,
          version: row.version,
          seoExtJson: row.seoExtJson,
          deletedAt: row.deletedAt,
          templateChoice: row.templateChoice,
          overridesThemePage: row.overridesThemePage,
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
