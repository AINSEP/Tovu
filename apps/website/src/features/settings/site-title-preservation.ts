import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { SiteTitlePreservationStorePort } from "./site-title.js";

/**
 * @file SPEC-050 (NC-3 = A): THE `SiteTitlePreservationStorePort` adapter over
 * `site_title_preexisting_workspaces`, one Kysely query body for every dialect (storage plan §4).
 * The marker migration inserts one row per workspace that existed when it ran, with `preserved_at`
 * NULL. Nothing else inserts. A row is pending until the pin sets `preserved_at`.
 * `site-title-preservation.sqlite.ts` is the thin subclass built from the content db handle.
 */
export class SqlSiteTitlePreservationStore implements SiteTitlePreservationStorePort {
  constructor(protected readonly kernel: ContentKernel) {}

  /** @complexity O(p log p) for p recorded workspaces (one per workspace that existed at migration time). */
  async listPendingWorkspaceIds(): Promise<string[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("site_title_preexisting_workspaces")
        .select("workspace_id")
        .where("preserved_at", "is", null)
        .orderBy("workspace_id")
        .execute()
    );
    return rows.map((row) => row.workspace_id);
  }

  /** @complexity O(log n), one primary-key lookup. */
  async isPending(workspaceId: string): Promise<boolean> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("site_title_preexisting_workspaces")
        .select("workspace_id")
        .where("workspace_id", "=", workspaceId)
        .where("preserved_at", "is", null)
        .limit(1)
        .executeTakeFirst()
    );
    return row !== undefined;
  }

  /** @complexity O(log n), one primary-key update. */
  async markPreserved(required: { workspaceId: string; preservedAt: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("site_title_preexisting_workspaces")
        .set({ preserved_at: required.preservedAt })
        .where("workspace_id", "=", required.workspaceId)
        .where("preserved_at", "is", null)
        .execute()
    );
  }
}
