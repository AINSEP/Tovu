import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { PgliteContentStore, PgliteExecutor } from "../../platform/db/pglite/content-store.js";
import { postRevisions, posts } from "../../platform/db/schema.postgres.js";
import type {
  PostAutosaveSnapshot,
  PostRecord,
  PostRepoPort,
  PostRevisionAppendResult,
  PostRevisionInput,
  PostRevisionOp,
  PostRevisionRecord,
} from "./post.js";
import { toRecord, toRow, updatableColumns } from "./repo.sqlite.js";

/**
 * @file PGlite post repository adapter — the `TOVU_CONTENT_STORE=pglite` prototype's first moved
 * repo. Same `PostRepoPort` contract as `repo.sqlite.ts` and `repo.memory.ts` (the rule-of-two suites
 * run all three), same query shapes, written against drizzle `pg-core` so it runs unchanged on
 * node-postgres later.
 *
 * Row mapping is SHARED with the SQLite adapter (`toRecord`/`toRow`/`updatableColumns`): the
 * generated Postgres schema keeps every column's JS shape (JSON as text via `jsonText`), so one set
 * of rules covers both and cannot drift.
 *
 * Not here yet: the post search index. `save()` on SQLite also refreshes the FTS5 projection; on
 * PGlite nothing is indexed (tsvector search is the audit's phase 5).
 */
export class PglitePostRepo implements PostRepoPort {
  constructor(private readonly store: PgliteContentStore) {}

  /** The open transaction's executor when inside {@link transaction}, else the base handle. */
  private async db(): Promise<PgliteExecutor> {
    await this.store.ready;
    return this.store.executor();
  }

  async findById(required: { workspaceId: string; id: string }): Promise<PostRecord | null> {
    const db = await this.db();
    const rows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    const db = await this.db();
    const rows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.slug, required.slug)))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async list(required: { workspaceId: string }): Promise<PostRecord[]> {
    const db = await this.db();
    const rows = await db.select().from(posts).where(eq(posts.workspaceId, required.workspaceId));
    return rows.map(toRecord);
  }

  async listPublishedPreviews(required: { workspaceId: string; limit: number }): Promise<PostRecord[]> {
    const db = await this.db();
    const rows = await db
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
      .limit(required.limit);
    return rows.map(toRecord);
  }

  async save(record: PostRecord): Promise<void> {
    const db = await this.db();
    const row = toRow(record);
    await db.insert(posts).values(row).onConflictDoUpdate({ target: posts.id, set: updatableColumns(row) });
  }

  /** One `UPDATE … WHERE version = ?`; `RETURNING` reports whether it landed, the same on every
   *  Postgres driver (a driver-specific affected-row count is not). */
  async saveIfVersion(required: { record: PostRecord; ifVersion: number }): Promise<{ applied: boolean }> {
    const db = await this.db();
    const row = toRow(required.record);
    const updated = await db
      .update(posts)
      .set(updatableColumns(row))
      .where(and(eq(posts.id, row.id), eq(posts.workspaceId, row.workspaceId), eq(posts.version, required.ifVersion)))
      .returning({ id: posts.id });
    return { applied: updated.length > 0 };
  }

  async softDelete(required: {
    workspaceId: string;
    id: string;
    deletedAt: string;
    updatedAt: string;
    version: number;
  }): Promise<void> {
    const db = await this.db();
    await db
      .update(posts)
      .set({ deletedAt: required.deletedAt, updatedAt: required.updatedAt, version: required.version })
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)));
  }

  /** Same cascade as the SQLite adapter minus the search projection, which PGlite does not have. */
  async hardDelete(required: { workspaceId: string; id: string }): Promise<void> {
    await this.transaction(async () => {
      const db = await this.db();
      await db
        .delete(postRevisions)
        .where(and(eq(postRevisions.workspaceId, required.workspaceId), eq(postRevisions.postId, required.id)));
      await db.delete(posts).where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)));
    });
  }

  async readAutosave(required: { workspaceId: string; id: string }): Promise<PostAutosaveSnapshot | null> {
    const db = await this.db();
    const rows = await db
      .select({ autosaveJson: posts.autosaveJson })
      .from(posts)
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)));
    const raw = rows[0]?.autosaveJson;
    return raw ? (JSON.parse(raw) as PostAutosaveSnapshot) : null;
  }

  async writeAutosave(required: {
    workspaceId: string;
    id: string;
    snapshot: PostAutosaveSnapshot;
  }): Promise<{ applied: boolean }> {
    const db = await this.db();
    const updated = await db
      .update(posts)
      .set({ autosaveJson: JSON.stringify(required.snapshot) })
      .where(
        and(
          eq(posts.workspaceId, required.workspaceId),
          eq(posts.id, required.id),
          eq(posts.version, required.snapshot.baseVersion)
        )
      )
      .returning({ id: posts.id });
    return { applied: updated.length > 0 };
  }

  async clearAutosave(required: { workspaceId: string; id: string }): Promise<void> {
    const db = await this.db();
    await db
      .update(posts)
      .set({ autosaveJson: null })
      .where(and(eq(posts.workspaceId, required.workspaceId), eq(posts.id, required.id)));
  }

  /** `previousId` is read BEFORE the insert; `contentHash` is over the exact text stored — both as
   *  in the SQLite adapter. */
  async appendRevision(input: PostRevisionInput): Promise<PostRevisionAppendResult> {
    const db = await this.db();
    const priorRows = await db
      .select({ id: postRevisions.id })
      .from(postRevisions)
      .where(and(eq(postRevisions.workspaceId, input.workspaceId), eq(postRevisions.postId, input.postId)))
      .orderBy(desc(postRevisions.seq))
      .limit(1);
    const previousId = priorRows[0]?.id ?? null;

    const id = randomUUID();
    const stateJsonText = JSON.stringify(input.stateJson);
    const contentHash = createHash("sha256").update(stateJsonText).digest("hex");

    await db.insert(postRevisions).values({
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
    });

    return { id, previousId };
  }

  async listRevisions(required: { workspaceId: string; postId: string }): Promise<PostRevisionRecord[]> {
    const db = await this.db();
    const rows = await db
      .select()
      .from(postRevisions)
      .where(and(eq(postRevisions.workspaceId, required.workspaceId), eq(postRevisions.postId, required.postId)))
      .orderBy(asc(postRevisions.seq));
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

  /** A real Postgres transaction; repo calls made inside `fn` join it (see `content-store.ts`).
   *  Calls to OTHER stores inside `fn` (the SQLite ones) are not part of it. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.store.transaction(fn);
  }
}
