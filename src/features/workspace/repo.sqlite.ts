import type { ContentDb } from "../../infra/sqlite/content-db";
import type { WorkspaceRecord, WorkspaceRepoPort } from "./create";

/**
 * @file better-sqlite3 workspace repository adapter.
 *
 * Satisfies the same `WorkspaceRepoPort` as `repo.memory.ts`, so the
 * create-workspace slice is unchanged (ADR-006 ports/adapters). Methods stay
 * async to honor the port; better-sqlite3 executes synchronously underneath.
 */
interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

function toRecord(row: WorkspaceRow): WorkspaceRecord {
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.created_at };
}

export class SqliteWorkspaceRepo implements WorkspaceRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: WorkspaceRecord): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO workspaces (id, name, slug, created_at) VALUES (@id, @name, @slug, @createdAt)"
      )
      .run(record);
  }

  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const row = this.db
      .prepare("SELECT id, name, slug, created_at FROM workspaces WHERE slug = ?")
      .get(slug) as WorkspaceRow | undefined;
    return row ? toRecord(row) : null;
  }
}
