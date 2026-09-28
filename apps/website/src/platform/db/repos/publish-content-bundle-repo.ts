import type { Selectable } from "kysely";

import type { PublishContentBundleRepoPort, StagedBundleRecord } from "#src/features/publish-content/bundle-staging";
import type { ContentKernel } from "../content-kernel.js";
import type { PublishContentBundlesTable } from "../content-database.generated.js";

/**
 * @file THE `PublishContentBundleRepoPort` adapter over `publish_content_bundles` (migration
 * `0066`): one Kysely query body for every dialect (storage plan §4, ADR-066). Publish-content
 * task 6 (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4). A plain
 * `INSERT` per write (a staged bundle has no group invariant across rows), a scoped read by
 * `(workspace_id, id)`. `sqlite/publish-content-bundle-repo.sqlite.ts` is the thin subclass.
 */

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Selectable<PublishContentBundlesTable>): StagedBundleRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourcePrincipalId: row.source_principal_id,
    artifactFormatVersion: row.artifact_format_version,
    hashVersion: row.hash_version,
    entitiesJson: row.entities_json,
    blobManifestJson: row.blob_manifest_json,
    sizeBytes: row.size_bytes,
    receivedAt: row.received_at,
    expiresAt: row.expires_at,
  };
}

export class SqlPublishContentBundleRepo implements PublishContentBundleRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  /** Append-only insert — a staged bundle id is minted fresh by `stageBundle` (`deps.idGen`), so
   *  this never needs to handle a duplicate-id conflict in practice (no transaction needed for a
   *  single-row append with no cross-row invariant). */
  async save(record: StagedBundleRecord): Promise<void> {
    await this.kernel.run((db) =>
      db
        .insertInto("publish_content_bundles")
        .values({
          id: record.id,
          workspace_id: record.workspaceId,
          source_principal_id: record.sourcePrincipalId,
          artifact_format_version: record.artifactFormatVersion,
          hash_version: record.hashVersion,
          entities_json: record.entitiesJson,
          blob_manifest_json: record.blobManifestJson,
          size_bytes: record.sizeBytes,
          received_at: record.receivedAt,
          expires_at: record.expiresAt,
        })
        .execute()
    );
  }

  async findById(input: { workspaceId: string; id: string }): Promise<StagedBundleRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("publish_content_bundles")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async deleteExpired(input: { expiredBefore: string }): Promise<number> {
    const result = await this.kernel.run((db) =>
      db.deleteFrom("publish_content_bundles").where("expires_at", "<", input.expiredBefore).executeTakeFirst()
    );
    return Number(result.numDeletedRows);
  }
}

/** The publish-content bundle repo on `kernel`'s database, whichever dialect. */
export function publishContentBundleRepoFor(kernel: ContentKernel): PublishContentBundleRepoPort {
  return new SqlPublishContentBundleRepo(kernel);
}
