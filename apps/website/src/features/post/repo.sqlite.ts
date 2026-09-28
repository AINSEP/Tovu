import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { JsonObject } from "@jini-ai/cms/core";
import { type SqliteKernel, sqliteKernel } from "../../platform/db/kernel/index.js";
import type * as schema from "../../platform/db/schema.sqlite.js";
import { postRevisions, posts } from "../../platform/db/schema.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
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
import { postSearchDocumentDelete, postSearchDocumentUpsert } from "./search-index.sqlite.js";

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
export function toRecord(row: PostRow): PostRecord {
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
export function toRow(record: PostRecord) {
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
export function updatableColumns(row: ReturnType<typeof toRow>) {
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

/** One `post_revisions` row as a {@link PostRevisionRecord}; shared with `repo.pg.ts`. */
export function toRevisionRecord(row: typeof postRevisions.$inferSelect): PostRevisionRecord {
  return {
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
  };
}

/** The revision row `appendRevision` writes: `contentHash` is over the exact text stored, computed
 *  here so no caller can hand in a hash that drifts from the bytes. Shared with `repo.pg.ts`. */
export function toRevisionRow(input: PostRevisionInput, id: string): typeof postRevisions.$inferInsert {
  const stateJsonText = JSON.stringify(input.stateJson);
  return {
    id,
    postId: input.postId,
    workspaceId: input.workspaceId,
    seq: input.seq,
    op: input.op,
    stateJson: stateJsonText,
    contentHash: createHash("sha256").update(stateJsonText).digest("hex"),
    actorId: input.actorId,
    delegatedByWorkspaceId: input.delegatedByWorkspaceId ?? null,
    delegatedById: input.delegatedById ?? null,
    restoredFrom: input.restoredFrom ?? null,
    recordedAt: input.recordedAt,
  };
}

/**
 * The SQLite post repo, on the storage kernel (the reference conversion every later repo copies:
 * `ADS-memory/.local-artifacts/plans/2026-09-28-storage-adapter-plan.md` §4).
 *
 * Every statement goes through `kernel.run` and is awaited; a method that writes more than one
 * statement (or reads then writes) runs in `kernel.transaction`, which joins the caller's own
 * transaction when there is one. Takes the kernel; the ~60 call sites that pass the content db
 * handle are unchanged, because `sqliteKernel` returns that connection's one kernel.
 */
export class SqlitePostRepo implements PostRepoPort {
  private readonly kernel: SqliteKernel<typeof schema>;

  /** The connection's kernel, or the content db handle it is derived from (the call sites that
   *  still pass one). */
  constructor(store: SqliteKernel<typeof schema> | ContentDb) {
    // `inTransaction`, not `dialect`: a Drizzle handle has a `dialect` property of its own.
    this.kernel = "inTransaction" in store ? store : sqliteKernel(store);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<PostRecord | null> {
    const rows = await this.kernel.run((db) =>
      db
        .select()
        .from(posts)
        .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
        .limit(1)
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    const rows = await this.kernel.run((db) =>
      db
        .select()
        .from(posts)
        .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.slug, required.slug)))
        .limit(1)
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async list(required: { workspaceId: string }): Promise<PostRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.select().from(posts).where(eq(posts.workspaceId, required.workspaceId))
    );
    return rows.map(toRecord);
  }

  /** See `PostRepoPort.listPublishedPreviews`'s own doc for the exact contract. Every filter
   *  (workspace, `status`, `kind`, non-trashed) and the `LIMIT` are pushed into the ONE query — no
   *  in-JS filter or slice after the fact, the discipline that method's doc requires. */
  async listPublishedPreviews(required: { workspaceId: string; limit: number }): Promise<PostRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
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
    );
    return rows.map(toRecord);
  }

  /** Upsert plus the search projection, in one transaction. The projection is refreshed here rather
   *  than by a trigger on `posts`, because the indexed body is plain text walked out of a nested
   *  TipTap document — an extraction SQL has no business attempting (see this file's header). */
  async save(record: PostRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) =>
        db.insert(posts).values(row).onConflictDoUpdate({ target: posts.id, set: updatableColumns(row) })
      );
      await this.kernel.execute(postSearchDocumentUpsert(toPostSearchDocument(record)));
    });
  }

  /**
   * See `PostRepoPort.saveIfVersion`'s own doc for the contract. An `UPDATE … WHERE id = ? AND
   * workspace_id = ? AND version = ?` — never the upsert `save()` above uses, because an absent row
   * must report `applied: false` rather than be inserted. The predicate and the write are ONE
   * statement (fable bugs audit C01); `RETURNING` reports whether it landed, the same on every
   * driver. The search index is refreshed only on a write that actually landed.
   *
   * @complexity O(1) — one statement against the `posts` primary key.
   */
  async saveIfVersion(required: { record: PostRecord; ifVersion: number }): Promise<{ applied: boolean }> {
    const row = toRow(required.record);
    return this.kernel.transaction(async () => {
      const updated = await this.kernel.run((db) =>
        db
          .update(posts)
          .set(updatableColumns(row))
          .where(and(eq(posts.id, row.id), eq(posts.workspaceId, row.workspaceId), eq(posts.version, required.ifVersion)))
          .returning({ id: posts.id })
      );
      if (updated.length === 0) return { applied: false };
      await this.kernel.execute(postSearchDocumentUpsert(toPostSearchDocument(required.record)));
      return { applied: true };
    });
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
    await this.kernel.run((db) =>
      db
        .update(posts)
        .set({ deletedAt: required.deletedAt, updatedAt: required.updatedAt, version: required.version })
        .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
    );
  }

  /**
   * See `PostRepoPort.hardDelete`'s own doc. A real `DELETE FROM`, with the SAME cascade the Trash
   * purge already performs on this table (`features/trash/adapters/post.ts`): `post_revisions`
   * holds a full copy of every version of the post, and `post_search_document` is the projection
   * behind the FTS index, so leaving either behind would keep the content findable after the row
   * it belongs to is gone. An unknown id or another workspace's row matches nothing: a no-op.
   *
   * @complexity O(r) for r revisions of the one post, plus one indexed row delete on each table.
   */
  async hardDelete(required: { workspaceId: string; id: string }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) =>
        db
          .delete(postRevisions)
          .where(and(eq(postRevisions.workspaceId, required.workspaceId), eq(postRevisions.postId, required.id)))
      );
      const removed = await this.kernel.run((db) =>
        db
          .delete(posts)
          .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
          .returning({ id: posts.id })
      );
      // Keyed on `post_id` alone (no workspace column on the projection), so it is dropped only when
      // the scoped delete above actually removed the row it projects.
      if (removed.length > 0) await this.kernel.execute(postSearchDocumentDelete(required.id));
    });
  }

  /** See `PostRepoPort.readAutosave`'s own doc. `autosave_json` is the only column read — never
   *  routed through {@link toRecord}, which has no field for it. */
  async readAutosave(required: { workspaceId: string; id: string }): Promise<PostAutosaveSnapshot | null> {
    const rows = await this.kernel.run((db) =>
      db
        .select({ autosaveJson: posts.autosaveJson })
        .from(posts)
        .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
    );
    const raw = rows[0]?.autosaveJson;
    return raw ? (JSON.parse(raw) as PostAutosaveSnapshot) : null;
  }

  /**
   * See `PostRepoPort.writeAutosave`'s own doc for the staleness contract. The `eq(posts.version,
   * snapshot.baseVersion)` clause IS the whole guard: a mismatch matches zero rows and this reports
   * `applied: false`. One `UPDATE`, no separate read-then-compare.
   */
  async writeAutosave(required: {
    workspaceId: string;
    id: string;
    snapshot: PostAutosaveSnapshot;
  }): Promise<{ applied: boolean }> {
    const updated = await this.kernel.run((db) =>
      db
        .update(posts)
        .set({ autosaveJson: JSON.stringify(required.snapshot) })
        .where(
          and(
            eq(posts.workspaceId, required.workspaceId),
            eq(posts.id, required.id),
            eq(posts.version, required.snapshot.baseVersion)
          )
        )
        .returning({ id: posts.id })
    );
    return { applied: updated.length > 0 };
  }

  /** See `PostRepoPort.clearAutosave`'s own doc — unconditional, no version guard. */
  async clearAutosave(required: { workspaceId: string; id: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .update(posts)
        .set({ autosaveJson: null })
        .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
    );
  }

  /**
   * See `PostRepoPort.appendRevision`'s own doc for the append-only contract. `previousId` is
   * looked up BEFORE the insert (the latest existing row for this `(workspaceId, postId)`, by
   * `seq DESC`), in the same transaction as the insert so no other append lands in between.
   *
   * @complexity O(1) — one indexed lookup plus one insert.
   */
  async appendRevision(input: PostRevisionInput): Promise<PostRevisionAppendResult> {
    return this.kernel.transaction(async () => {
      const prior = await this.kernel.run((db) =>
        db
          .select({ id: postRevisions.id })
          .from(postRevisions)
          .where(and(eq(postRevisions.workspaceId, input.workspaceId), eq(postRevisions.postId, input.postId)))
          .orderBy(desc(postRevisions.seq))
          .limit(1)
      );
      const id = randomUUID();
      await this.kernel.run((db) => db.insert(postRevisions).values(toRevisionRow(input, id)));
      return { id, previousId: prior[0]?.id ?? null };
    });
  }

  /** See `PostRepoPort.listRevisions`'s own doc — the only read surface over `appendRevision`'s
   *  writes. Ascending `seq` (oldest first), matching a ledger's natural read order. */
  async listRevisions(required: { workspaceId: string; postId: string }): Promise<PostRevisionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .select()
        .from(postRevisions)
        .where(and(eq(postRevisions.workspaceId, required.workspaceId), eq(postRevisions.postId, required.postId)))
        .orderBy(asc(postRevisions.seq))
    );
    return rows.map(toRevisionRecord);
  }

  /** See `PostRepoPort.transaction`'s own doc: repo calls made inside `fn` join ONE transaction
   *  (the post write, then `appendRevision`). Nested calls join the outer one. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.kernel.transaction(fn);
  }
}
