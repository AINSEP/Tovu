import { createHash, randomUUID } from "node:crypto";

import type Database from "better-sqlite3";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { JsonObject } from "@jini-ai/cms/core";
import { postRevisions, posts } from "../../platform/db/schema.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import {
  DEFAULT_BODY_JSON,
  type PostAutosaveSnapshot,
  type PostBodyFormat,
  type PostKind,
  type PostRecord,
  type PostRepoPort,
  type PostRevisionAppendResult,
  type PostRevisionInput,
  type PostRevisionOp,
  type PostRevisionRecord,
  type PostStatus,
} from "./post.js";
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
 * `PostRecord.bodyJson` stays a required `JsonObject` (unwidened) so `DEFAULT_BODY_JSON` fills the
 * gap here rather than widening the type to `JsonObject | null` for every consumer. This placeholder
 * is inert only for a consumer that branches on `bodyFormat` before trusting `bodyJson` — widget
 * embeds and `entry_refs` extraction each have a separate `"html"`-format entry point that reads
 * `bodyHtml` instead (see `widgets/resolver-service.ts`'s and `core/entry-refs/extractor.ts`'s own
 * "HTML Page" sections), and search indexing here in `save()` never runs against an `"html"` row at
 * all (that path is never called for one). SEO excerpting (`deriveExcerpt` in `features/seo/seo.ts`)
 * used to skip that branch and read this placeholder unconditionally — every `"html"`-format entry
 * silently got an empty derived description — until it was fixed to read `bodyHtml` the same way.
 * `toHeadlessPost` (SPEC-047 REQ-3's discriminated union) is the reference branch; any new consumer
 * of `bodyJson` must check `bodyFormat` the same way before trusting it.
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
    memberAccessJson: row.memberAccessJson ?? null,
    createdByPrincipalId: row.createdByPrincipalId ?? null,
    createdAt: row.createdAt ?? null,
    ...(ext !== undefined ? { ext } : {}),
  };
}

/**
 * `toRecord`'s inverse: the exact column values one whole-row write persists.
 *
 * Extracted from `save()` (2026-09-07) because `saveIfVersion` writes the identical columns from the
 * identical record and a second hand-maintained copy of these rules is how one write path silently
 * stops honouring the body-format CHECK constraint or the `overridesThemePage` tri-state while its
 * sibling keeps doing it right.
 *
 * @complexity O(size of the record's JSON fields) — two `JSON.stringify` calls.
 */
function toRow(record: PostRecord) {
  return {
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
    // format; these two lines are what keep every write on the legal side of it.
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
    memberAccessJson: record.memberAccessJson ?? null,
    // Authorship attribution (2026-09-18) — written here so a fresh INSERT (createPost's `save()`
    // upsert) carries them, but see `updatableColumns()` directly below: this same value is
    // deliberately EXCLUDED from the columns an existing-row write may touch, which is what actually
    // makes them write-once. See `posts.createdByPrincipalId`'s schema doc for the full contract.
    createdByPrincipalId: record.createdByPrincipalId ?? null,
    createdAt: record.createdAt ?? null,
    ext: JSON.stringify(record.ext ?? {}),
  };
}

/**
 * The columns a write to an EXISTING row sets — `toRow` minus `id`, and minus every column this
 * repo is not the writer of.
 *
 * `autosaveJson` is the one that matters and the reason this is a named list rather than a spread:
 * a standing-draft snapshot is written only by `writeAutosave`/`clearAutosave`, so a whole-row save
 * (which carries no such field on `PostRecord` at all) must leave that column exactly where it is.
 * `id` is excluded because it is the match key on both write paths.
 *
 * `createdByPrincipalId`/`createdAt` (2026-09-18) are excluded for the identical reason, by the
 * identical mechanism, for a different feature: they are write-once authorship attribution, set
 * only by `createPost`'s insert. `save()`/`saveIfVersion()` both route an UPDATE through this same
 * list (see each method below), so omitting the pair here — not a runtime `if` in either method —
 * is what makes `updatePost` structurally incapable of overwriting them, regardless of what value
 * the `PostRecord` it was handed happens to carry for either field.
 *
 * @complexity O(1).
 */
function updatableColumns(row: ReturnType<typeof toRow>) {
  return {
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
    memberAccessJson: row.memberAccessJson,
    ext: row.ext,
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

  /** See `PostRepoPort.listPublishedPreviews`'s own doc for the exact contract. Every filter
   *  (workspace, `status`, `kind`, non-trashed) and the `LIMIT` are pushed into the ONE query — no
   *  in-JS filter or slice after the fact, the discipline that method's doc requires. */
  async listPublishedPreviews(required: { workspaceId: string; limit: number }): Promise<PostRecord[]> {
    const rows = this.db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.workspaceId, required.workspaceId),
          eq(posts.status, "published"),
          eq(posts.kind, "post"),
          isNull(posts.deletedAt)
        )
      )
      .orderBy(desc(posts.updatedAt))
      .limit(required.limit)
      .all();
    return rows.map(toRecord);
  }

  async save(record: PostRecord): Promise<void> {
    const row = toRow(record);
    this.db
      .insert(posts)
      .values(row)
      .onConflictDoUpdate({
        target: posts.id,
        set: updatableColumns(row),
      })
      .run();

    // Refreshed here rather than by a trigger on `posts`, because the indexed body is plain text
    // walked out of a nested TipTap document — an extraction SQL has no business attempting. This
    // is the only writer of the three indexed columns, so this is the only place the obligation
    // exists (see this file's header).
    indexPostSearchDocument(this.db.$client, toPostSearchDocument(record));
  }

  /**
   * See `PostRepoPort.saveIfVersion`'s own doc for the contract. An `UPDATE … WHERE id = ? AND
   * workspace_id = ? AND version = ?` — never the upsert `save()` above uses, because an absent row
   * must report `applied: false` rather than be inserted.
   *
   * The predicate and the write are ONE statement, which is the entire point: a compare done in
   * JavaScript and a write issued afterwards is exactly the gap `updatePost` had (fable bugs audit
   * C01). Same mechanism `writeAutosave` below already uses for its own column.
   *
   * The search index is refreshed only on a write that actually landed — a rejected call must leave
   * the index describing the row that is really there.
   *
   * @complexity O(1) — one statement against the `posts` primary key.
   */
  async saveIfVersion(required: {
    record: PostRecord;
    ifVersion: number;
  }): Promise<{ applied: boolean }> {
    const row = toRow(required.record);
    const result = this.db
      .update(posts)
      .set(updatableColumns(row))
      .where(
        and(
          eq(posts.id, row.id),
          eq(posts.workspaceId, row.workspaceId),
          eq(posts.version, required.ifVersion)
        )
      )
      .run();
    if (result.changes === 0) return { applied: false };

    indexPostSearchDocument(this.db.$client, toPostSearchDocument(required.record));
    return { applied: true };
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

  /**
   * See `PostRepoPort.hardDelete`'s own doc. A real `DELETE FROM`, with the SAME cascade the Trash
   * purge already performs on this table (`features/trash/adapters/post.ts`): `post_revisions`
   * holds a full copy of every version of the post, and `post_search_document` is the projection
   * behind the FTS index, so leaving either behind would keep the content findable after the row
   * it belongs to is gone. The parked autosave needs no cascade here — `autosave_json` is a column
   * ON the row, so it travels with it (the in-memory adapter keeps it in a side map and must drop
   * it explicitly; the contract test asserts the same observable outcome on both).
   *
   * No `changes` check and no throw for a miss: an unknown id or another workspace's row simply
   * matches nothing, which is the documented no-op.
   *
   * @complexity O(r) for r revisions of the one post, plus one indexed row delete on each table.
   */
  async hardDelete(required: { workspaceId: string; id: string }): Promise<void> {
    this.db
      .delete(postRevisions)
      .where(and(eq(postRevisions.workspaceId, required.workspaceId), eq(postRevisions.postId, required.id)))
      .run();
    const removed = this.db
      .delete(posts)
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
      .run();
    // Keyed on `post_id` alone (no workspace column on the projection), so it is dropped only when
    // the scoped delete above actually removed the row it projects.
    if (removed.changes > 0) {
      this.db.$client.prepare(`DELETE FROM post_search_document WHERE post_id = ?`).run(required.id);
    }
  }

  /** See `PostRepoPort.readAutosave`'s own doc. `autosave_json` is the only column read — never
   *  routed through {@link toRecord}, which has no field for it. */
  async readAutosave(required: { workspaceId: string; id: string }): Promise<PostAutosaveSnapshot | null> {
    const rows = this.db
      .select({ autosaveJson: posts.autosaveJson })
      .from(posts)
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
      .all();
    const raw = rows[0]?.autosaveJson;
    return raw ? (JSON.parse(raw) as PostAutosaveSnapshot) : null;
  }

  /**
   * See `PostRepoPort.writeAutosave`'s own doc for the staleness contract. The `eq(posts.version,
   * snapshot.baseVersion)` clause IS the whole guard — a version mismatch (row not found, or a real
   * save has since bumped it) makes the `WHERE` match zero rows, `run().changes` reports that, and
   * this method reports `applied: false` rather than throwing or silently no-op-ing without telling
   * the caller. One `UPDATE`, no separate read-then-compare (avoids a TOCTOU gap between the two).
   */
  async writeAutosave(required: {
    workspaceId: string;
    id: string;
    snapshot: PostAutosaveSnapshot;
  }): Promise<{ applied: boolean }> {
    const result = this.db
      .update(posts)
      .set({ autosaveJson: JSON.stringify(required.snapshot) })
      .where(
        and(
          eq(posts.workspaceId, required.workspaceId),
          eq(posts.id, required.id),
          eq(posts.version, required.snapshot.baseVersion)
        )
      )
      .run();
    return { applied: result.changes > 0 };
  }

  /** See `PostRepoPort.clearAutosave`'s own doc — unconditional, no version guard. */
  async clearAutosave(required: { workspaceId: string; id: string }): Promise<void> {
    this.db
      .update(posts)
      .set({ autosaveJson: null })
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
      .run();
  }

  /**
   * See `PostRepoPort.appendRevision`'s own doc for the append-only contract. `previousId` is
   * looked up BEFORE the insert (the latest existing row for this `(workspaceId, postId)`, by
   * `seq DESC`) — looking it up after would just find the row this call is about to write.
   * `contentHash` is computed here, not carried on `PostRevisionInput`, so every caller gets an
   * identical hashing rule with no chance of a hand-computed hash drifting from the bytes actually
   * stored.
   *
   * @complexity O(1) — one indexed lookup plus one insert.
   */
  async appendRevision(input: PostRevisionInput): Promise<PostRevisionAppendResult> {
    const priorRows = this.db
      .select({ id: postRevisions.id })
      .from(postRevisions)
      .where(and(eq(postRevisions.workspaceId, input.workspaceId), eq(postRevisions.postId, input.postId)))
      .orderBy(desc(postRevisions.seq))
      .limit(1)
      .all();
    const previousId = priorRows[0]?.id ?? null;

    const id = randomUUID();
    const stateJsonText = JSON.stringify(input.stateJson);
    const contentHash = createHash("sha256").update(stateJsonText).digest("hex");

    this.db
      .insert(postRevisions)
      .values({
        id,
        postId: input.postId,
        workspaceId: input.workspaceId,
        seq: input.seq,
        op: input.op,
        stateJson: stateJsonText,
        contentHash,
        actorId: input.actorId,
        delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
        delegatedById: input.delegatedById ?? null,
        restoredFrom: input.restoredFrom ?? null,
        recordedAt: input.recordedAt,
      })
      .run();

    return { id, previousId };
  }

  /** See `PostRepoPort.listRevisions`'s own doc — the only read surface over `appendRevision`'s
   *  writes. Ascending `seq` (oldest first), matching a ledger's natural read order. */
  async listRevisions(required: { workspaceId: string; postId: string }): Promise<PostRevisionRecord[]> {
    const rows = this.db
      .select()
      .from(postRevisions)
      .where(and(eq(postRevisions.workspaceId, required.workspaceId), eq(postRevisions.postId, required.postId)))
      .orderBy(asc(postRevisions.seq))
      .all();
    return rows.map((row) => ({
      id: row.id,
      postId: row.postId,
      workspaceId: row.workspaceId,
      seq: row.seq,
      op: row.op as PostRevisionOp,
      stateJson: JSON.parse(row.stateJson) as PostRecord,
      contentHash: row.contentHash,
      actorId: row.actorId,
      delegatedByWorkspaceId: row.delegatedByWorkspaceId,
      delegatedById: row.delegatedById,
      restoredFrom: row.restoredFrom,
      recordedAt: row.recordedAt,
    }));
  }

  /**
   * See `PostRepoPort.transaction`'s own doc for why this exists (two repo calls — the post write,
   * then `appendRevision` — must land as one unit). Manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`
   * rather than Drizzle's own `db.transaction()` wrapper, mirroring `SqliteSettingsRepo.transaction`
   * exactly: that wrapper requires a synchronous callback, and `fn` here awaits other async repo
   * calls. `$client` (the raw better-sqlite3 handle) exists at runtime on every `drizzle()`-
   * constructed instance but isn't part of the exported `BetterSQLite3Database` class type
   * `ContentDb` aliases — a known drizzle-orm typing gap — so the cast below is narrowly scoped to
   * this one call site, same as every other adapter in this codebase that needs it.
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
