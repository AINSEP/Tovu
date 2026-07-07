import type { JsonObject } from "../../core/ports";
import type { ContentDb } from "../../infra/sqlite/content-db";
import type { PostRecord, PostRepoPort, PostStatus } from "./post";

/**
 * @file better-sqlite3 post repository adapter.
 *
 * Satisfies the same `PostRepoPort` as `repo.memory.ts`. `bodyJson` is stored as
 * a TEXT column (JSON), parsed back on read. Insertion order is preserved via
 * rowid so list output matches the in-memory adapter.
 */
interface PostRow {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  body_json: string;
  status: string;
  updated_at: string;
  version: number;
}

function toRecord(row: PostRow): PostRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    slug: row.slug,
    bodyJson: JSON.parse(row.body_json) as JsonObject,
    status: row.status as PostStatus,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

const COLUMNS = "id, workspace_id, title, slug, body_json, status, updated_at, version";

export class SqlitePostRepo implements PostRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<PostRecord | null> {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM posts WHERE workspace_id = ? AND id = ?`)
      .get(required.workspaceId, required.id) as PostRow | undefined;
    return row ? toRecord(row) : null;
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM posts WHERE workspace_id = ? AND slug = ?`)
      .get(required.workspaceId, required.slug) as PostRow | undefined;
    return row ? toRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<PostRecord[]> {
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM posts WHERE workspace_id = ? ORDER BY rowid`)
      .all(required.workspaceId) as PostRow[];
    return rows.map(toRecord);
  }

  async save(record: PostRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO posts (${COLUMNS})
         VALUES (@id, @workspaceId, @title, @slug, @bodyJson, @status, @updatedAt, @version)
         ON CONFLICT (id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           title        = excluded.title,
           slug         = excluded.slug,
           body_json    = excluded.body_json,
           status       = excluded.status,
           updated_at   = excluded.updated_at,
           version      = excluded.version`
      )
      .run({ ...record, bodyJson: JSON.stringify(record.bodyJson) });
  }
}
