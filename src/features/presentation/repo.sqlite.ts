import type { ContentDb } from "../../infra/sqlite/content-db";
import type {
  PresentationSettingsRecord,
  PresentationSettingsRepoPort,
  ThemeId,
} from "./presentation";

/**
 * @file better-sqlite3 presentation-settings repository adapter.
 *
 * Satisfies the same `PresentationSettingsRepoPort` as `repo.memory.ts`. One row
 * per workspace; `save` upserts on `workspace_id`.
 */
interface PresentationRow {
  workspace_id: string;
  active_theme_id: string;
  updated_at: string;
}

function toRecord(row: PresentationRow): PresentationSettingsRecord {
  return {
    workspaceId: row.workspace_id,
    activeThemeId: row.active_theme_id as ThemeId,
    updatedAt: row.updated_at,
  };
}

export class SqlitePresentationSettingsRepo implements PresentationSettingsRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByWorkspaceId(workspaceId: string): Promise<PresentationSettingsRecord | null> {
    const row = this.db
      .prepare(
        "SELECT workspace_id, active_theme_id, updated_at FROM presentation_settings WHERE workspace_id = ?"
      )
      .get(workspaceId) as PresentationRow | undefined;
    return row ? toRecord(row) : null;
  }

  async save(record: PresentationSettingsRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO presentation_settings (workspace_id, active_theme_id, updated_at)
         VALUES (@workspaceId, @activeThemeId, @updatedAt)
         ON CONFLICT (workspace_id) DO UPDATE SET
           active_theme_id = excluded.active_theme_id,
           updated_at      = excluded.updated_at`
      )
      .run(record);
  }
}
