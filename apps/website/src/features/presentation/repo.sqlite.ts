import { eq } from "drizzle-orm";

import { presentationSettings } from "../../platform/db/schema.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import type {
  PresentationSettingsRecord,
  PresentationSettingsRepoPort,
  ThemeId,
} from "@jini-ai/cms/presentation";

/**
 * @file Drizzle/SQLite presentation-settings repository adapter.
 *
 * Satisfies the same `PresentationSettingsRepoPort` as `repo.memory.ts`. One row per
 * workspace; `save` upserts on `workspace_id`.
 */
type PresentationRow = typeof presentationSettings.$inferSelect;

function toRecord(row: PresentationRow): PresentationSettingsRecord {
  return {
    workspaceId: row.workspaceId,
    activeThemeId: row.activeThemeId as ThemeId,
    updatedAt: row.updatedAt,
  };
}

export class SqlitePresentationSettingsRepo implements PresentationSettingsRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByWorkspaceId(workspaceId: string): Promise<PresentationSettingsRecord | null> {
    return findOneBy(this.db, presentationSettings, [eq(presentationSettings.workspaceId, workspaceId)], toRecord);
  }

  async save(record: PresentationSettingsRecord): Promise<void> {
    this.db
      .insert(presentationSettings)
      .values(record)
      .onConflictDoUpdate({
        target: presentationSettings.workspaceId,
        set: { activeThemeId: record.activeThemeId, updatedAt: record.updatedAt },
      })
      .run();
  }

  async listAll(): Promise<PresentationSettingsRecord[]> {
    const rows = this.db.select().from(presentationSettings).all();
    return rows.map(toRecord);
  }
}
