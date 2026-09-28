import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { PgKernel } from "../../platform/db/kernel/index.js";
import type * as pgSchema from "../../platform/db/schema.postgres.js";
import { postRevisions, posts } from "../../platform/db/schema.postgres.js";
import type {
  PostAutosaveSnapshot,
  PostRecord,
  PostRepoPort,
  PostRevisionAppendResult,
  PostRevisionInput,
  PostRevisionRecord,
} from "./post.js";
import { toRecord, toRevisionRecord, toRevisionRow, toRow, updatableColumns } from "./repo.sqlite.js";

/**
 * @file Postgres post repository adapter (PGlite today, node-postgres later: it is typed against
 * Drizzle's `PgDatabase` through the storage kernel). Same `PostRepoPort` contract and the same
 * method bodies as `repo.sqlite.ts` — only the table objects differ — and the row mapping is SHARED
 * with it (`toRecord`/`toRow`/`updatableColumns`/`toRevisionRecord`/`toRevisionRow`): the generated
 * Postgres schema keeps every column's JS shape, so one set of rules covers both and cannot drift.
 *
 * Not here yet: the post search projection. SQLite's `save()` also refreshes the FTS5 projection;
 * Postgres gets a `tsvector` index in plan slice F1.
 */
export class PgPostRepo implements PostRepoPort {
  constructor(private readonly kernel: PgKernel<typeof pgSchema>) {}

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

  /** Upsert. In a transaction like the SQLite body, which also writes the search projection here. */
  async save(record: PostRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) =>
        db.insert(posts).values(row).onConflictDoUpdate({ target: posts.id, set: updatableColumns(row) })
      );
    });
  }

  /**
   * See `PostRepoPort.saveIfVersion`'s own doc for the contract. An `UPDATE … WHERE id = ? AND
   * workspace_id = ? AND version = ?` — never the upsert `save()` above uses, because an absent row
   * must report `applied: false` rather than be inserted. The predicate and the write are ONE
   * statement (fable bugs audit C01); `RETURNING` reports whether it landed, the same on every
   * driver.
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
      return { applied: updated.length > 0 };
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
   * purge already performs on this table (`features/trash/adapters/post.ts`) minus the search
   * projection, which Postgres does not have yet. An unknown id or another workspace's row matches
   * nothing: a no-op.
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
      await this.kernel.run((db) =>
        db.delete(posts).where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
      );
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
