import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type { PresentationSettingsRecord, ThemeId } from "@jini-ai/cms/presentation";

/**
 * @file Row mapping for `presentation_settings`, shared by every dialect (the generated
 * `ContentDatabase` snake_case columns). Neutral on purpose — no repo, no driver.
 */

export type PresentationSettingsRow = Selectable<ContentDatabase["presentation_settings"]>;

/** One `presentation_settings` row as a {@link PresentationSettingsRecord}. */
export function toPresentationRecord(row: PresentationSettingsRow): PresentationSettingsRecord {
  return {
    workspaceId: row.workspace_id,
    activeThemeId: row.active_theme_id as ThemeId,
    updatedAt: row.updated_at,
  };
}

/** The `presentation_settings` row `save` upserts. */
export function toPresentationRow(record: PresentationSettingsRecord): Insertable<ContentDatabase["presentation_settings"]> {
  return {
    workspace_id: record.workspaceId,
    active_theme_id: record.activeThemeId,
    updated_at: record.updatedAt,
  };
}
