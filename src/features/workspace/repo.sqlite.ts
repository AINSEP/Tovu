import { eq } from "drizzle-orm";

import { workspaces } from "../../infra/db/schema";
import type { ContentDb } from "../../infra/sqlite/content-db";
import type { WorkspaceRecord, WorkspaceRepoPort } from "./create";

/**
 * @file Drizzle/SQLite workspace repository adapter.
 *
 * Satisfies the same `WorkspaceRepoPort` as `repo.memory.ts`, so the
 * create-workspace slice is unchanged (ADR-006 ports/adapters).
 */
type WorkspaceRow = typeof workspaces.$inferSelect;

function toRecord(row: WorkspaceRow): WorkspaceRecord {
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt };
}

export class SqliteWorkspaceRepo implements WorkspaceRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: WorkspaceRecord): Promise<void> {
    this.db.insert(workspaces).values(record).run();
  }

  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const rows = this.db.select().from(workspaces).where(eq(workspaces.slug, slug)).all();
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
