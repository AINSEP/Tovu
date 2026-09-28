import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { CommentRepoPort } from "./ports.js";
import { type CommentTables, toLogEntry, toLogRow, toRecord, toRow } from "./repo.rows.js";
import type { CommentRecord, CommentStatus, CommentThreadNode, ModerationAction, ModerationLogEntry, ModerationQueuePage } from "./types.js";

/**
 * @file THE comments repository: one Kysely query body for every database the storage kernel
 * drives, over the two `p_comments__*` dataModule tables (ADR-023 §2/§7). Those tables are not in
 * the migrated core schema, so each query starts from `db.withTables<CommentTables>()`.
 *
 * Every statement goes through `kernel.run` and is awaited. A write that spans the comment row and
 * its moderation-log row runs in `kernel.transaction`, and a read-then-write (moderate, purge)
 * takes `lockKey` on the comment first so two moderators cannot interleave on Postgres.
 */

const buildThread = (comments: readonly CommentRecord[], parentId: string | null): CommentThreadNode[] =>
  comments
    .filter((c) => c.parentId === parentId)
    .map((comment) => ({ comment, replies: buildThread(comments, comment.id) }));

export class SqlCommentRepo implements CommentRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<CommentRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<CommentTables>()
        .selectFrom("p_comments__comments")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async listThreadForEntry(required: {
    workspaceId: string;
    entryId: string;
    includeStatuses?: readonly CommentStatus[];
  }): Promise<CommentThreadNode[]> {
    const statuses = [...(required.includeStatuses ?? ["approved"])];
    if (statuses.length === 0) return [];
    const rows = await this.kernel.run((db) =>
      db
        .withTables<CommentTables>()
        .selectFrom("p_comments__comments")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("entry_id", "=", required.entryId)
        .where("status", "in", statuses)
        .orderBy("created_at", "asc")
        .execute()
    );
    return buildThread(rows.map(toRecord), null);
  }

  /** Keyset page over `(created_at, id)`, fetching `limit + 1` rows to learn whether more follow. */
  async listModerationQueue(required: {
    workspaceId: string;
    status: CommentStatus;
    limit: number;
    cursor?: string | null;
  }): Promise<ModerationQueuePage> {
    const rows = await this.kernel.run(async (db) => {
      const tables = db.withTables<CommentTables>();
      const marker = required.cursor
        ? await tables
            .selectFrom("p_comments__comments")
            .select(["created_at", "id"])
            .where("workspace_id", "=", required.workspaceId)
            .where("id", "=", required.cursor)
            .executeTakeFirst()
        : undefined;
      let query = tables
        .selectFrom("p_comments__comments")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("status", "=", required.status);
      if (marker) {
        // `(created_at, id) > (?, ?)` spelled out, so no dialect's row-value support is assumed.
        query = query.where((eb) =>
          eb.or([
            eb("created_at", ">", marker.created_at),
            eb.and([eb("created_at", "=", marker.created_at), eb("id", ">", marker.id)]),
          ])
        );
      }
      return query.orderBy("created_at", "asc").orderBy("id", "asc").limit(required.limit + 1).execute();
    });

    const hasMore = rows.length > required.limit;
    const page = rows.slice(0, required.limit).map(toRecord);
    return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
  }

  async countByStatus(required: { workspaceId: string; entryId?: string; status: CommentStatus }): Promise<number> {
    const row = await this.kernel.run((db) => {
      let query = db
        .withTables<CommentTables>()
        .selectFrom("p_comments__comments")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("workspace_id", "=", required.workspaceId)
        .where("status", "=", required.status);
      if (required.entryId !== undefined) query = query.where("entry_id", "=", required.entryId);
      return query.executeTakeFirst();
    });
    // Postgres returns a COUNT as a bigint string.
    return Number(row?.n ?? 0);
  }

  /** OQ-3 (SPEC-035): the comment and its `submit` log row land as ONE atomic transaction. */
  async create(record: CommentRecord, submitLog?: ModerationLogEntry): Promise<void> {
    const insertComment = () =>
      this.kernel.run((db) => db.withTables<CommentTables>().insertInto("p_comments__comments").values(toRow(record)).execute());
    if (!submitLog) {
      await insertComment();
      return;
    }
    await this.kernel.transaction(async () => {
      await insertComment();
      await this.kernel.run((db) =>
        db.withTables<CommentTables>().insertInto("p_comments__moderation_log").values(toLogRow(submitLog)).execute()
      );
    });
  }

  async listModerationLog(required: { workspaceId: string; commentId: string }): Promise<ModerationLogEntry[]> {
    const rows = await this.kernel.run((db) =>
      db
        .withTables<CommentTables>()
        .selectFrom("p_comments__moderation_log")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("comment_id", "=", required.commentId)
        .orderBy("at", "asc")
        .orderBy("id", "asc")
        .execute()
    );
    return rows.map(toLogEntry);
  }

  async applyModeration(required: {
    workspaceId: string;
    id: string;
    expectedVersion: number;
    action: ModerationAction;
    toStatus: CommentStatus;
    actorPrincipalId: string;
    note: string | null;
    at: string;
  }): ReturnType<CommentRepoPort["applyModeration"]> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`comments:${required.workspaceId}:${required.id}`);
      const current = await this.findById({ workspaceId: required.workspaceId, id: required.id });
      if (!current) return { ok: false, reason: "not-found" } as const;
      if (current.version !== required.expectedVersion) {
        return { ok: false, reason: "conflict", currentVersion: current.version } as const;
      }

      const logId = `${required.id}-${required.at}-${current.version + 1}`;
      const updated = await this.kernel.run((db) =>
        db
          .withTables<CommentTables>()
          .updateTable("p_comments__comments")
          .set((eb) => ({ status: required.toStatus, updated_at: required.at, version: eb("version", "+", 1) }))
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .where("version", "=", required.expectedVersion)
          .returning("id")
          .execute()
      );
      if (updated.length === 0) {
        const latest = await this.findById({ workspaceId: required.workspaceId, id: required.id });
        return { ok: false, reason: "conflict", currentVersion: latest?.version } as const;
      }

      const log: ModerationLogEntry = {
        id: logId,
        workspaceId: required.workspaceId,
        commentId: required.id,
        actorPrincipalId: required.actorPrincipalId,
        action: required.action,
        fromStatus: current.status,
        toStatus: required.toStatus,
        at: required.at,
        note: required.note,
      };
      await this.kernel.run((db) => db.withTables<CommentTables>().insertInto("p_comments__moderation_log").values(toLogRow(log)).execute());
      const record = await this.findById({ workspaceId: required.workspaceId, id: required.id });
      return { ok: true, record: record!, log } as const;
    });
  }

  async purge(required: {
    workspaceId: string;
    id: string;
    actorPrincipalId: string;
    note: string | null;
    at: string;
  }): ReturnType<CommentRepoPort["purge"]> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`comments:${required.workspaceId}:${required.id}`);
      const current = await this.findById({ workspaceId: required.workspaceId, id: required.id });
      if (!current) return { ok: false, reason: "not-found" } as const;

      const log: ModerationLogEntry = {
        id: `${required.id}-${required.at}-purge`,
        workspaceId: required.workspaceId,
        commentId: required.id,
        actorPrincipalId: required.actorPrincipalId,
        action: "purge",
        fromStatus: current.status,
        toStatus: current.status,
        at: required.at,
        note: required.note,
      };
      await this.kernel.run((db) =>
        db
          .withTables<CommentTables>()
          .deleteFrom("p_comments__comments")
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .execute()
      );
      await this.kernel.run((db) => db.withTables<CommentTables>().insertInto("p_comments__moderation_log").values(toLogRow(log)).execute());
      return { ok: true, log } as const;
    });
  }
}

/** The comments repo for `kernel`. */
export function commentRepoFor(kernel: ContentKernel): SqlCommentRepo {
  return new SqlCommentRepo(kernel);
}
