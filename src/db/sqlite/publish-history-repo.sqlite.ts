import { and, desc, eq } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";

import {
  type PublishHistoryEntry,
  type PublishHistoryStore,
  type PublishTrigger,
} from "../../features/deployments/static-publish/publish-history.js";
import { resolvePublishHistoryListLimit } from "../../contracts/core/publish-history-list-limit.js";
import type { StaticPublishTargetId } from "../../features/deployments/static-publish/types.js";
import { publishHistory } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `PublishHistoryStore` adapter (2026-08-16 rework — see `static-publish/publish-history.ts`'s
 * own header for why this replaced a flat JSON file under `infra/publish-history/`). ADR-006
 * rule-of-two "second adapter" half; `InMemoryPublishHistoryStore` (same domain file) is the first.
 * Mirrors `publish-credential-repo.sqlite.ts`'s shape — a plain `INSERT` per write (this table has no
 * group invariant to maintain across rows the way `publishCredentialSets.isDefault` does, so there is
 * no transaction to wrap it in), `ORDER BY id DESC` reads scoped by `workspace_id` (+ optional
 * `target`).
 */

type Row = typeof publishHistory.$inferSelect;

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Row): PublishHistoryEntry {
  return {
    target: row.target as StaticPublishTargetId,
    url: row.url,
    reachable: row.reachable,
    status: row.status,
    projectName: row.projectName,
    publishedAt: row.publishedAt,
    ...(row.owner !== null ? { owner: row.owner } : {}),
    ...(row.repo !== null ? { repo: row.repo } : {}),
    ...(row.basePath !== null ? { basePath: row.basePath } : {}),
    ...(row.deploymentId !== null ? { deploymentId: row.deploymentId } : {}),
    ...(row.commitSha !== null ? { commitSha: row.commitSha } : {}),
    ...(row.branch !== null ? { branch: row.branch } : {}),
    triggeredBy: row.triggeredBy as PublishTrigger,
  };
}

/** @complexity O(1). */
function toValues(workspaceId: UUID, entry: PublishHistoryEntry): typeof publishHistory.$inferInsert {
  return {
    workspaceId,
    target: entry.target,
    url: entry.url,
    reachable: entry.reachable,
    status: entry.status,
    projectName: entry.projectName,
    publishedAt: entry.publishedAt,
    owner: entry.owner ?? null,
    repo: entry.repo ?? null,
    basePath: entry.basePath ?? null,
    deploymentId: entry.deploymentId ?? null,
    commitSha: entry.commitSha ?? null,
    branch: entry.branch ?? null,
    triggeredBy: entry.triggeredBy,
  };
}

export class SqlitePublishHistoryStore implements PublishHistoryStore {
  constructor(private readonly db: ContentDb) {}

  async getLast(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<PublishHistoryEntry | null> {
    const rows = this.db
      .select()
      .from(publishHistory)
      .where(and(eq(publishHistory.workspaceId, input.workspaceId), eq(publishHistory.target, input.target)))
      .orderBy(desc(publishHistory.id))
      .limit(1)
      .all();
    return rows[0] !== undefined ? toRecord(rows[0]) : null;
  }

  async list(input: { workspaceId: UUID; target?: StaticPublishTargetId; limit?: number }): Promise<PublishHistoryEntry[]> {
    const limit = resolvePublishHistoryListLimit(input.limit);
    const condition =
      input.target !== undefined
        ? and(eq(publishHistory.workspaceId, input.workspaceId), eq(publishHistory.target, input.target))
        : eq(publishHistory.workspaceId, input.workspaceId);
    const rows = this.db.select().from(publishHistory).where(condition).orderBy(desc(publishHistory.id)).limit(limit).all();
    return rows.map(toRecord);
  }

  /** Append-only insert — issues a raw `INSERT`, no transaction control of its own (mirrors
   *  `redirects/repo.sqlite.ts`'s `insertRevision`: a single-row append has no group invariant to
   *  protect, unlike `publishCredentialSets.isDefault`'s "at most one true" rule). */
  async recordSuccess(input: { workspaceId: UUID; entry: PublishHistoryEntry }): Promise<void> {
    this.db.insert(publishHistory).values(toValues(input.workspaceId, input.entry)).run();
  }
}
