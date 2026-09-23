import { and, eq, isNull } from "drizzle-orm";

import { siteTitlePreexistingWorkspaces as marker } from "../../platform/db/schema.sqlite.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { SiteTitlePreservationStorePort } from "./site-title.js";

/**
 * @file SPEC-050 (NC-3 = A): the SQLite adapter for `SiteTitlePreservationStorePort`, over
 * `site_title_preexisting_workspaces`. The marker migration inserts one row per workspace that
 * existed when it ran, with `preserved_at` NULL. Nothing else inserts. A row is pending until the pin
 * sets `preserved_at`.
 */
export class SqliteSiteTitlePreservationStore implements SiteTitlePreservationStorePort {
  constructor(private readonly db: ContentDb) {}

  /** @complexity O(p log p) for p recorded workspaces (one per workspace that existed at migration time). */
  async listPendingWorkspaceIds(): Promise<string[]> {
    return this.db
      .select({ workspaceId: marker.workspaceId })
      .from(marker)
      .where(isNull(marker.preservedAt))
      .orderBy(marker.workspaceId)
      .all()
      .map((row) => row.workspaceId);
  }

  /** @complexity O(log n), one primary-key lookup. */
  async isPending(workspaceId: string): Promise<boolean> {
    const rows = this.db
      .select({ workspaceId: marker.workspaceId })
      .from(marker)
      .where(and(eq(marker.workspaceId, workspaceId), isNull(marker.preservedAt)))
      .limit(1)
      .all();
    return rows.length > 0;
  }

  /** @complexity O(log n), one primary-key update. */
  async markPreserved(required: { workspaceId: string; preservedAt: string }): Promise<void> {
    this.db
      .update(marker)
      .set({ preservedAt: required.preservedAt })
      .where(and(eq(marker.workspaceId, required.workspaceId), isNull(marker.preservedAt)))
      .run();
  }
}
