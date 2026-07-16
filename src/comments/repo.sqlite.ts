/**
 * @file SQLite `CommentRepoPort` adapter (ADR-006 rule-of-two durable half) over the two
 * `p_comments__*` tables the dataModule engine creates from `COMMENTS_DATA_MODULE`
 * (ADR-023 §2/§7 — core-owned typed writes, no raw plugin SQL upstream of this file).
 *
 * Takes the raw `better-sqlite3` handle (mirrors `store-plugin.ts`'s and
 * `data-module-manifest.ts`'s own convention for querying dataModule-created tables — these are
 * NOT part of the Drizzle-managed core schema, so there is no `ContentDb`/Drizzle query surface
 * over them).
 */
import type Database from "better-sqlite3";

import { COMMENTS_PLUGIN_ID } from "./types";
import type { CommentRepoPort } from "./ports";
import type { CommentRecord, CommentStatus, CommentThreadNode, ModerationAction, ModerationLogEntry, ModerationQueuePage } from "./types";

const COMMENTS_TABLE = `p_${COMMENTS_PLUGIN_ID}__comments`;
const MODERATION_LOG_TABLE = `p_${COMMENTS_PLUGIN_ID}__moderation_log`;

interface CommentRow {
  id: string;
  workspace_id: string;
  entry_id: string;
  parent_id: string | null;
  thread_root_id: string;
  depth: number;
  status: string;
  author_principal_id: string | null;
  author_name: string;
  author_email: string | null;
  author_url: string | null;
  author_ip_hash: string | null;
  body_text: string;
  spam_score: number | null;
  spam_provider: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

function toRecord(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entryId: row.entry_id,
    parentId: row.parent_id,
    threadRootId: row.thread_root_id,
    depth: row.depth,
    status: row.status as CommentStatus,
    authorPrincipalId: row.author_principal_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    authorUrl: row.author_url,
    authorIpHash: row.author_ip_hash,
    bodyText: row.body_text,
    spamScore: row.spam_score,
    spamProvider: row.spam_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function buildThread(comments: readonly CommentRecord[], parentId: string | null): CommentThreadNode[] {
  return comments
    .filter((c) => c.parentId === parentId)
    .map((comment) => ({ comment, replies: buildThread(comments, comment.id) }));
}

export class SqliteCommentRepo implements CommentRepoPort {
  constructor(private readonly db: Database.Database) {}

  async findById(required: { workspaceId: string; id: string }): Promise<CommentRecord | null> {
    const row = this.db
      .prepare(`SELECT * FROM "${COMMENTS_TABLE}" WHERE workspace_id = ? AND id = ?`)
      .get(required.workspaceId, required.id) as CommentRow | undefined;
    return row ? toRecord(row) : null;
  }

  async listThreadForEntry(required: {
    workspaceId: string;
    entryId: string;
    includeStatuses?: readonly CommentStatus[];
  }): Promise<CommentThreadNode[]> {
    const statuses = required.includeStatuses ?? ["approved"];
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT * FROM "${COMMENTS_TABLE}" WHERE workspace_id = ? AND entry_id = ? AND status IN (${placeholders}) ORDER BY created_at ASC`
      )
      .all(required.workspaceId, required.entryId, ...statuses) as CommentRow[];
    return buildThread(rows.map(toRecord), null);
  }

  async listModerationQueue(required: {
    workspaceId: string;
    status: CommentStatus;
    limit: number;
    cursor?: string | null;
  }): Promise<ModerationQueuePage> {
    let cursorMarker: { created_at: string; id: string } | undefined;
    if (required.cursor) {
      cursorMarker = this.db
        .prepare(`SELECT created_at, id FROM "${COMMENTS_TABLE}" WHERE workspace_id = ? AND id = ?`)
        .get(required.workspaceId, required.cursor) as { created_at: string; id: string } | undefined;
    }

    const rows = cursorMarker
      ? (this.db
          .prepare(
            `SELECT * FROM "${COMMENTS_TABLE}"
             WHERE workspace_id = ? AND status = ? AND (created_at, id) > (?, ?)
             ORDER BY created_at ASC, id ASC
             LIMIT ?`
          )
          .all(required.workspaceId, required.status, cursorMarker.created_at, cursorMarker.id, required.limit + 1) as CommentRow[])
      : (this.db
          .prepare(`SELECT * FROM "${COMMENTS_TABLE}" WHERE workspace_id = ? AND status = ? ORDER BY created_at ASC, id ASC LIMIT ?`)
          .all(required.workspaceId, required.status, required.limit + 1) as CommentRow[]);

    const hasMore = rows.length > required.limit;
    const page = rows.slice(0, required.limit).map(toRecord);
    return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
  }

  async countByStatus(required: { workspaceId: string; entryId?: string; status: CommentStatus }): Promise<number> {
    const row =
      required.entryId === undefined
        ? (this.db.prepare(`SELECT COUNT(*) AS n FROM "${COMMENTS_TABLE}" WHERE workspace_id = ? AND status = ?`).get(required.workspaceId, required.status) as { n: number })
        : (this.db
            .prepare(`SELECT COUNT(*) AS n FROM "${COMMENTS_TABLE}" WHERE workspace_id = ? AND status = ? AND entry_id = ?`)
            .get(required.workspaceId, required.status, required.entryId) as { n: number });
    return row.n;
  }

  async create(record: CommentRecord, submitLog?: ModerationLogEntry): Promise<void> {
    const insertComment = (): void => {
      this.db
        .prepare(
          `INSERT INTO "${COMMENTS_TABLE}"
           (id, workspace_id, entry_id, parent_id, thread_root_id, depth, status, author_principal_id, author_name, author_email, author_url, author_ip_hash, body_text, spam_score, spam_provider, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.workspaceId,
          record.entryId,
          record.parentId,
          record.threadRootId,
          record.depth,
          record.status,
          record.authorPrincipalId,
          record.authorName,
          record.authorEmail,
          record.authorUrl,
          record.authorIpHash,
          record.bodyText,
          record.spamScore,
          record.spamProvider,
          record.createdAt,
          record.updatedAt,
          record.version
        );
    };

    if (!submitLog) {
      insertComment();
      return;
    }

    // OQ-3 resolution (SPEC-035): the comment row and its `submit` moderation_log row land as ONE
    // atomic transaction — mirrors `applyModeration`/`purge`'s existing both-or-neither pattern
    // below, and `SqliteChangeSetRepo.insert()`'s optional-event co-persistence (ADR-046 BR-04).
    this.db.transaction(() => {
      insertComment();
      this.db
        .prepare(
          `INSERT INTO "${MODERATION_LOG_TABLE}" (id, workspace_id, comment_id, actor_principal_id, action, from_status, to_status, at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          submitLog.id,
          submitLog.workspaceId,
          submitLog.commentId,
          submitLog.actorPrincipalId,
          submitLog.action,
          submitLog.fromStatus,
          submitLog.toStatus,
          submitLog.at,
          submitLog.note
        );
    })();
  }

  async listModerationLog(required: { workspaceId: string; commentId: string }): Promise<ModerationLogEntry[]> {
    const rows = this.db
      .prepare(`SELECT * FROM "${MODERATION_LOG_TABLE}" WHERE workspace_id = ? AND comment_id = ? ORDER BY at ASC, id ASC`)
      .all(required.workspaceId, required.commentId) as {
      id: string;
      workspace_id: string;
      comment_id: string;
      actor_principal_id: string;
      action: string;
      from_status: string | null;
      to_status: string;
      at: string;
      note: string | null;
    }[];
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      commentId: row.comment_id,
      actorPrincipalId: row.actor_principal_id,
      action: row.action as ModerationAction,
      fromStatus: row.from_status as CommentStatus | null,
      toStatus: row.to_status as CommentStatus,
      at: row.at,
      note: row.note,
    }));
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
    const current = await this.findById({ workspaceId: required.workspaceId, id: required.id });
    if (!current) return { ok: false, reason: "not-found" };
    if (current.version !== required.expectedVersion) {
      return { ok: false, reason: "conflict", currentVersion: current.version };
    }

    const logId = `${required.id}-${required.at}-${current.version + 1}`;
    let conflicted = false;

    this.db.transaction(() => {
      const result = this.db
        .prepare(`UPDATE "${COMMENTS_TABLE}" SET status = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?`)
        .run(required.toStatus, required.at, required.workspaceId, required.id, required.expectedVersion);
      if (result.changes === 0) {
        conflicted = true;
        return;
      }
      this.db
        .prepare(
          `INSERT INTO "${MODERATION_LOG_TABLE}" (id, workspace_id, comment_id, actor_principal_id, action, from_status, to_status, at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(logId, required.workspaceId, required.id, required.actorPrincipalId, required.action, current.status, required.toStatus, required.at, required.note);
    })();

    if (conflicted) {
      const latest = await this.findById({ workspaceId: required.workspaceId, id: required.id });
      return { ok: false, reason: "conflict", currentVersion: latest?.version };
    }

    const updated = await this.findById({ workspaceId: required.workspaceId, id: required.id });
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
    return { ok: true, record: updated!, log };
  }

  async purge(required: {
    workspaceId: string;
    id: string;
    actorPrincipalId: string;
    note: string | null;
    at: string;
  }): ReturnType<CommentRepoPort["purge"]> {
    const current = await this.findById({ workspaceId: required.workspaceId, id: required.id });
    if (!current) return { ok: false, reason: "not-found" };

    const logId = `${required.id}-${required.at}-purge`;
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM "${COMMENTS_TABLE}" WHERE workspace_id = ? AND id = ?`).run(required.workspaceId, required.id);
      this.db
        .prepare(
          `INSERT INTO "${MODERATION_LOG_TABLE}" (id, workspace_id, comment_id, actor_principal_id, action, from_status, to_status, at, note)
           VALUES (?, ?, ?, ?, 'purge', ?, ?, ?, ?)`
        )
        .run(logId, required.workspaceId, required.id, required.actorPrincipalId, current.status, current.status, required.at, required.note);
    })();

    const log: ModerationLogEntry = {
      id: logId,
      workspaceId: required.workspaceId,
      commentId: required.id,
      actorPrincipalId: required.actorPrincipalId,
      action: "purge",
      fromStatus: current.status,
      toStatus: current.status,
      at: required.at,
      note: required.note,
    };
    return { ok: true, log };
  }
}
