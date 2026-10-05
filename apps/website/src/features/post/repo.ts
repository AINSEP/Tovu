import { randomUUID } from "node:crypto";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  PostAutosaveSnapshot,
  PostRecord,
  PostRepoPort,
  PostRevisionAppendResult,
  PostRevisionInput,
  PostRevisionRecord,
} from "./post.js";
import { toRecord, toRevisionRecord, toRevisionRow, toRow, updatableColumns } from "./repo.rows.js";
import { toPostSearchDocument, type PostSearchDocument } from "./search.js";
import { currentIso } from "../../contracts/core/scheduled-publish.js";
import { postSearchFor } from "./search-index.js";

/**
 * @file THE post repository: one Kysely query body for every database the storage kernel drives
 * (SQLite, PGlite, Postgres). The reference conversion every later repo copies — storage-adapter
 * plan §4, ADR-066.
 *
 * Every statement goes through `kernel.run` and is awaited; a method that writes more than one
 * statement (or reads then writes) runs in `kernel.transaction`, which joins the caller's own
 * transaction when there is one. Row mapping lives in `repo.rows.ts`; the one genuinely
 * dialect-specific piece — the search projection — is a {@link PostSearchProjection} adapter.
 *
 * SEARCH INDEX: `save()` — and only `save()` — also refreshes this post's searchable projection.
 * That is the whole sync obligation, because `title`/`slug`/`bodyJson` are the only indexed values
 * and this is their only writer. `softDelete()` deliberately does NOT touch it; a trashed post is
 * excluded by the search query's own `deleted_at IS NULL` filter against the live row, which is also
 * what makes a later restore searchable again with no extra step. See `search-index.ts`.
 */

/** Where a dialect keeps post search text. Written in the same transaction as the post. */
export interface PostSearchProjection {
  upsert(kernel: ContentKernel, document: PostSearchDocument): Promise<void>;
  remove(kernel: ContentKernel, postId: string): Promise<void>;
}

export class SqlPostRepo implements PostRepoPort {
  constructor(
    protected readonly kernel: ContentKernel,
    private readonly search: PostSearchProjection
  ) {}

  async findById(required: { workspaceId: string; id: string }): Promise<PostRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("posts")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("posts")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("slug", "=", required.slug)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<PostRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("posts").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  /** See `PostRepoPort.listPublishedPreviews`'s own doc for the exact contract. Every filter
   *  (workspace, `status`, `kind`, non-trashed) and the `LIMIT` are pushed into the ONE query — no
   *  in-JS filter or slice after the fact, the discipline that method's doc requires. */
  async listPublishedPreviews(required: { workspaceId: string; limit: number; nowIso?: string }): Promise<PostRecord[]> {
    const nowIso = required.nowIso ?? currentIso();
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("posts")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("status", "=", "published")
        .where("kind", "=", "post")
        .where("deleted_at", "is", null)
        // Scheduled publishing: same rule as `isLiveAt` — ISO UTC strings compare in time order.
        .where((eb) => eb.or([eb("publish_at", "is", null), eb("publish_at", "<=", nowIso)]))
        .orderBy("updated_at", "desc")
        .limit(required.limit)
        .execute()
    );
    return rows.map(toRecord);
  }

  /** Upsert plus the search projection, in one transaction. The projection is refreshed here rather
   *  than by a trigger on `posts`, because the indexed body is plain text walked out of a nested
   *  TipTap document — an extraction SQL has no business attempting. */
  async save(record: PostRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) =>
        db
          .insertInto("posts")
          .values(row)
          .onConflict((oc) => oc.column("id").doUpdateSet(updatableColumns(row)))
          .execute()
      );
      await this.search.upsert(this.kernel, toPostSearchDocument(record));
    });
  }

  /**
   * See `PostRepoPort.saveIfVersion`'s own doc for the contract. An `UPDATE … WHERE id = ? AND
   * workspace_id = ? AND version = ?` — never the upsert `save()` above uses, because an absent row
   * must report `applied: false` rather than be inserted. The predicate and the write are ONE
   * statement (fable bugs audit C01); `RETURNING` reports whether it landed, the same on every
   * driver. The search projection is refreshed only on a write that actually landed.
   *
   * @complexity O(1) — one statement against the `posts` primary key.
   */
  async saveIfVersion(required: { record: PostRecord; ifVersion: number }): Promise<{ applied: boolean }> {
    const row = toRow(required.record);
    return this.kernel.transaction(async () => {
      const updated = await this.kernel.run((db) =>
        db
          .updateTable("posts")
          .set(updatableColumns(row))
          .where("id", "=", row.id)
          .where("workspace_id", "=", row.workspace_id)
          .where("version", "=", required.ifVersion)
          .returning("id")
          .execute()
      );
      if (updated.length === 0) return { applied: false };
      await this.search.upsert(this.kernel, toPostSearchDocument(required.record));
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
        .updateTable("posts")
        .set({ deleted_at: required.deletedAt, updated_at: required.updatedAt, version: required.version })
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()
    );
  }

  /**
   * See `PostRepoPort.hardDelete`'s own doc. A real `DELETE FROM`, with the SAME cascade the Trash
   * purge already performs on this table (`features/trash/adapters/post.ts`): `post_revisions`
   * holds a full copy of every version of the post, and the search projection would keep the
   * content findable after the row it belongs to is gone. An unknown id or another workspace's row
   * matches nothing: a no-op.
   *
   * @complexity O(r) for r revisions of the one post, plus one indexed row delete on each table.
   */
  async hardDelete(required: { workspaceId: string; id: string }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) =>
        db
          .deleteFrom("post_revisions")
          .where("workspace_id", "=", required.workspaceId)
          .where("post_id", "=", required.id)
          .execute()
      );
      const removed = await this.kernel.run((db) =>
        db
          .deleteFrom("posts")
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .returning("id")
          .execute()
      );
      // Keyed on the post id alone (no workspace column on the projection), so it is dropped only
      // when the scoped delete above actually removed the row it projects.
      if (removed.length > 0) await this.search.remove(this.kernel, required.id);
    });
  }

  /** See `PostRepoPort.readAutosave`'s own doc. `autosave_json` is the only column read — never
   *  routed through `toRecord`, which has no field for it. */
  async readAutosave(required: { workspaceId: string; id: string }): Promise<PostAutosaveSnapshot | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("posts")
        .select("autosave_json")
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .executeTakeFirst()
    );
    const raw = row?.autosave_json;
    return raw ? (JSON.parse(raw) as PostAutosaveSnapshot) : null;
  }

  /**
   * See `PostRepoPort.writeAutosave`'s own doc for the staleness contract. The `version =
   * snapshot.baseVersion` clause IS the whole guard: a mismatch matches zero rows and this reports
   * `applied: false`. One `UPDATE`, no separate read-then-compare.
   */
  async writeAutosave(required: {
    workspaceId: string;
    id: string;
    snapshot: PostAutosaveSnapshot;
  }): Promise<{ applied: boolean }> {
    const updated = await this.kernel.run((db) =>
      db
        .updateTable("posts")
        .set({ autosave_json: JSON.stringify(required.snapshot) })
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .where("version", "=", required.snapshot.baseVersion)
        .returning("id")
        .execute()
    );
    return { applied: updated.length > 0 };
  }

  /** See `PostRepoPort.clearAutosave`'s own doc — unconditional, no version guard. */
  async clearAutosave(required: { workspaceId: string; id: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("posts")
        .set({ autosave_json: null })
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()
    );
  }

  /**
   * See `PostRepoPort.appendRevision`'s own doc for the append-only contract. `previousId` is the
   * latest existing row for this `(workspaceId, postId)` (by `seq DESC`), read BEFORE the insert.
   *
   * No other append may land between that read and the insert. A transaction alone does not
   * guarantee it on Postgres (READ COMMITTED: two appends can read the same latest row), so the
   * transaction first takes `lockKey` on the post's revision stream: a concurrent append for the
   * same post waits for this commit and then reads this row as its previous. (SQLite: the
   * transaction's `BEGIN IMMEDIATE` already serializes writers.) Proven with two connections in
   * `__tests__/repo.postgres.test.ts`.
   *
   * @complexity O(1) — one indexed lookup plus one insert.
   */
  async appendRevision(input: PostRevisionInput): Promise<PostRevisionAppendResult> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`post_revisions:${input.workspaceId}:${input.postId}`);
      const prior = await this.kernel.run((db) =>
        db
          .selectFrom("post_revisions")
          .select("id")
          .where("workspace_id", "=", input.workspaceId)
          .where("post_id", "=", input.postId)
          .orderBy("seq", "desc")
          .limit(1)
          .executeTakeFirst()
      );
      const id = randomUUID();
      await this.kernel.run((db) => db.insertInto("post_revisions").values(toRevisionRow(input, id)).execute());
      return { id, previousId: prior?.id ?? null };
    });
  }

  /** See `PostRepoPort.listRevisions`'s own doc — the only read surface over `appendRevision`'s
   *  writes. Ascending `seq` (oldest first), matching a ledger's natural read order. */
  async listRevisions(required: { workspaceId: string; postId: string }): Promise<PostRevisionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("post_revisions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("post_id", "=", required.postId)
        .orderBy("seq", "asc")
        .execute()
    );
    return rows.map(toRevisionRecord);
  }

  /** See `PostRepoPort.transaction`'s own doc: repo calls made inside `fn` join ONE transaction
   *  (the post write, then `appendRevision`). Nested calls join the outer one. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.kernel.transaction(fn);
  }
}

/** The post repo for `kernel`, with its dialect's search projection. */
export function postRepoFor(kernel: ContentKernel): SqlPostRepo {
  return new SqlPostRepo(kernel, postSearchFor(kernel));
}
