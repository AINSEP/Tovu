/**
 * @file In-memory `CommentRepoPort` adapter (ADR-006 rule-of-two "test/dev" half;
 * `repo.sqlite.ts` is the durable half).
 */
import type { CommentRepoPort } from "./ports.js";
import type { CommentRecord, CommentStatus, CommentThreadNode, ModerationLogEntry, ModerationQueuePage } from "./types.js";

function buildThread(comments: readonly CommentRecord[], parentId: string | null): CommentThreadNode[] {
  return comments
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((comment) => ({ comment, replies: buildThread(comments, comment.id) }));
}

export class InMemoryCommentRepo implements CommentRepoPort {
  private comments: CommentRecord[];
  private log: ModerationLogEntry[];

  constructor(initialComments: CommentRecord[] = [], initialLog: ModerationLogEntry[] = []) {
    this.comments = [...initialComments];
    this.log = [...initialLog];
  }

  async findById(required: { workspaceId: string; id: string }): Promise<CommentRecord | null> {
    return this.comments.find((c) => c.workspaceId === required.workspaceId && c.id === required.id) ?? null;
  }

  async listThreadForEntry(required: {
    workspaceId: string;
    entryId: string;
    includeStatuses?: readonly CommentStatus[];
  }): Promise<CommentThreadNode[]> {
    const statuses = required.includeStatuses ?? ["approved"];
    const scoped = this.comments.filter(
      (c) => c.workspaceId === required.workspaceId && c.entryId === required.entryId && statuses.includes(c.status)
    );
    return buildThread(scoped, null);
  }

  async listModerationQueue(required: {
    workspaceId: string;
    status: CommentStatus;
    limit: number;
    cursor?: string | null;
  }): Promise<ModerationQueuePage> {
    const scoped = this.comments
      .filter((c) => c.workspaceId === required.workspaceId && c.status === required.status)
      .sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)));

    const startIndex = required.cursor ? scoped.findIndex((c) => c.id === required.cursor) + 1 : 0;
    const page = scoped.slice(startIndex, startIndex + required.limit);
    const nextCursor = startIndex + required.limit < scoped.length ? page[page.length - 1]?.id ?? null : null;
    return { items: page, nextCursor };
  }

  async countByStatus(required: { workspaceId: string; entryId?: string; status: CommentStatus }): Promise<number> {
    return this.comments.filter(
      (c) => c.workspaceId === required.workspaceId && c.status === required.status && (required.entryId === undefined || c.entryId === required.entryId)
    ).length;
  }

  async create(record: CommentRecord, submitLog?: ModerationLogEntry): Promise<void> {
    this.comments.push({ ...record });
    if (submitLog) this.log.push({ ...submitLog });
  }

  async listModerationLog(required: { workspaceId: string; commentId: string }): Promise<ModerationLogEntry[]> {
    return this.log
      .filter((entry) => entry.workspaceId === required.workspaceId && entry.commentId === required.commentId)
      .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
  }

  async applyModeration(required: {
    workspaceId: string;
    id: string;
    expectedVersion: number;
    action: ModerationLogEntry["action"];
    toStatus: CommentStatus;
    actorPrincipalId: string;
    note: string | null;
    at: string;
  }): ReturnType<CommentRepoPort["applyModeration"]> {
    const index = this.comments.findIndex((c) => c.workspaceId === required.workspaceId && c.id === required.id);
    if (index === -1) return { ok: false, reason: "not-found" };
    const current = this.comments[index];
    if (current.version !== required.expectedVersion) {
      return { ok: false, reason: "conflict", currentVersion: current.version };
    }

    const updated: CommentRecord = { ...current, status: required.toStatus, updatedAt: required.at, version: current.version + 1 };
    const logEntry: ModerationLogEntry = {
      id: `modlog-${required.id}-${this.log.length}`,
      workspaceId: required.workspaceId,
      commentId: required.id,
      actorPrincipalId: required.actorPrincipalId,
      action: required.action,
      fromStatus: current.status,
      toStatus: required.toStatus,
      at: required.at,
      note: required.note,
    };

    this.comments[index] = updated;
    this.log.push(logEntry);
    return { ok: true, record: updated, log: logEntry };
  }

  async purge(required: {
    workspaceId: string;
    id: string;
    actorPrincipalId: string;
    note: string | null;
    at: string;
  }): ReturnType<CommentRepoPort["purge"]> {
    const index = this.comments.findIndex((c) => c.workspaceId === required.workspaceId && c.id === required.id);
    if (index === -1) return { ok: false, reason: "not-found" };
    const current = this.comments[index];

    const logEntry: ModerationLogEntry = {
      id: `modlog-${required.id}-${this.log.length}`,
      workspaceId: required.workspaceId,
      commentId: required.id,
      actorPrincipalId: required.actorPrincipalId,
      action: "purge",
      fromStatus: current.status,
      toStatus: current.status,
      at: required.at,
      note: required.note,
    };

    this.comments.splice(index, 1);
    this.log.push(logEntry);
    return { ok: true, log: logEntry };
  }
}
