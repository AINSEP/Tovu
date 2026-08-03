import { eq } from "drizzle-orm";

import { workspaces } from "../../db/schema";
import type { ContentDb } from "../../db/sqlite/content-db";
import { findOneBy } from "../../db/sqlite/repo-helpers";
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
    return findOneBy(this.db, workspaces, [eq(workspaces.slug, slug)], toRecord);
  }

  /** SPEC-044 REQ-08. */
  async findById(id: string): Promise<WorkspaceRecord | null> {
    return findOneBy(this.db, workspaces, [eq(workspaces.id, id)], toRecord);
  }

  /** SPEC-044 REQ-08. All workspace rows (v1 always has exactly one — see `delete.ts`'s header). */
  async list(): Promise<WorkspaceRecord[]> {
    return this.db.select().from(workspaces).all().map(toRecord);
  }

  /** SPEC-044 REQ-08. */
  async update(record: WorkspaceRecord): Promise<void> {
    this.db
      .update(workspaces)
      .set({ name: record.name, slug: record.slug })
      .where(eq(workspaces.id, record.id))
      .run();
  }

  /** SPEC-044 REQ-08. */
  async delete(id: string): Promise<void> {
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run();
  }
}
