import type { PresentationSettingsRecord, PresentationSettingsRepoPort } from "@jini-ai/cms/presentation";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import { toPresentationRecord, toPresentationRow } from "./repo.rows.js";

/**
 * @file THE presentation-settings repository: one Kysely query body for every database the storage
 * kernel drives (SQLite, PGlite, Postgres). One row per workspace; `save` upserts on `workspace_id`.
 * Every statement goes through `kernel.run` and is awaited.
 */
export class SqlPresentationSettingsRepo implements PresentationSettingsRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByWorkspaceId(workspaceId: string): Promise<PresentationSettingsRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("presentation_settings")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toPresentationRecord(row) : null;
  }

  async save(record: PresentationSettingsRecord): Promise<void> {
    const row = toPresentationRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("presentation_settings")
        .values(row)
        .onConflict((oc) =>
          oc.column("workspace_id").doUpdateSet({ active_theme_id: row.active_theme_id, updated_at: row.updated_at })
        )
        .execute()
    );
  }

  async listAll(): Promise<PresentationSettingsRecord[]> {
    const rows = await this.kernel.run((db) => db.selectFrom("presentation_settings").selectAll().execute());
    return rows.map(toPresentationRecord);
  }
}

/** The presentation-settings repo for `kernel`. */
export function presentationSettingsRepoFor(kernel: ContentKernel): SqlPresentationSettingsRepo {
  return new SqlPresentationSettingsRepo(kernel);
}
