import { and, eq, lt } from "drizzle-orm";

import type { PublishContentBundleRepoPort, StagedBundleRecord } from "#src/features/publish-content/bundle-staging";
import { publishContentBundles } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Task 6 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 6.
 *
 * Real SQLite `PublishContentBundleRepoPort` adapter over `publish_content_bundles`
 * (migration `0066`, `platform/db/schema.sqlite.ts`). Mirrors `publish-history-repo.sqlite.ts`'s shape: a
 * plain `INSERT` per write (a staged bundle has no group invariant to maintain across rows, unlike
 * `publishCredentialSets.isDefault`), a scoped `SELECT` read by `(workspace_id, id)`.
 */

type Row = typeof publishContentBundles.$inferSelect;

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Row): StagedBundleRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourcePrincipalId: row.sourcePrincipalId,
    artifactFormatVersion: row.artifactFormatVersion,
    hashVersion: row.hashVersion,
    entitiesJson: row.entitiesJson,
    blobManifestJson: row.blobManifestJson,
    sizeBytes: row.sizeBytes,
    receivedAt: row.receivedAt,
    expiresAt: row.expiresAt,
  };
}

export class SqlitePublishContentBundleRepo implements PublishContentBundleRepoPort {
  constructor(private readonly db: ContentDb) {}

  /** Append-only insert — a staged bundle id is minted fresh by `stageBundle` (`deps.idGen`), so
   *  this never needs to handle a duplicate-id conflict in practice; mirrors
   *  `publish-history-repo.sqlite.ts`'s `recordSuccess` (no transaction needed for a single-row
   *  append with no cross-row invariant). */
  async save(record: StagedBundleRecord): Promise<void> {
    this.db.insert(publishContentBundles).values({ ...record }).run();
  }

  async findById(input: { workspaceId: string; id: string }): Promise<StagedBundleRecord | null> {
    const row = this.db
      .select()
      .from(publishContentBundles)
      .where(and(eq(publishContentBundles.workspaceId, input.workspaceId), eq(publishContentBundles.id, input.id)))
      .get();
    return row ? toRecord(row) : null;
  }

  async deleteExpired(input: { expiredBefore: string }): Promise<number> {
    return this.db
      .delete(publishContentBundles)
      .where(lt(publishContentBundles.expiresAt, input.expiredBefore))
      .run().changes;
  }
}
