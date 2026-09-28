import type { Selectable } from "kysely";

import type { PublishContentPeerRecord, PublishContentPeerRepoPort } from "#src/features/publish-content/peers";
import type { ContentKernel } from "../content-kernel.js";
import type { PublishContentPeersTable } from "../content-database.generated.js";

/**
 * @file THE `PublishContentPeerRepoPort` adapter over `publish_content_peers`: one Kysely query
 * body for every dialect (storage plan §4, ADR-066). Publish-content task 10
 * (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4).
 * `sqlite/publish-content-peer-repo.sqlite.ts` is the thin subclass built from the content db handle.
 *
 * The four `sealed_*` columns are read and written as ONE opaque group, never field-by-field, so a
 * partially-written ciphertext is not representable here. The group is nullable as a group: a peer
 * row may have no credential yet (a label + URL an operator saved before issuing a key on the
 * peer). {@link toRecord} therefore returns `sealed: null` unless ALL FOUR columns are present — a
 * row with three of them is a corrupted row, and surfacing it as `null` makes it a "no credential"
 * refusal at the one place that decrypts, rather than an AEAD error deep in the transport.
 */

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Selectable<PublishContentPeersTable>): PublishContentPeerRecord {
  const sealed =
    row.sealed_key_id !== null && row.sealed_ciphertext !== null && row.sealed_nonce !== null && row.sealed_alg !== null
      ? { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg }
      : null;
  return {
    workspaceId: row.workspace_id,
    id: row.id,
    label: row.label,
    baseUrl: row.base_url,
    remoteWorkspaceId: row.remote_workspace_id,
    sealed,
    masked: row.masked,
    aadVersion: row.aad_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** @complexity O(1). */
function toColumns(record: PublishContentPeerRecord) {
  return {
    workspace_id: record.workspaceId,
    id: record.id,
    label: record.label,
    base_url: record.baseUrl,
    remote_workspace_id: record.remoteWorkspaceId,
    sealed_key_id: record.sealed?.keyId ?? null,
    sealed_ciphertext: record.sealed?.ciphertext ?? null,
    sealed_nonce: record.sealed?.nonce ?? null,
    sealed_alg: record.sealed?.alg ?? null,
    masked: record.masked,
    aad_version: record.aadVersion,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SqlPublishContentPeerRepo implements PublishContentPeerRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async insert(record: PublishContentPeerRecord): Promise<void> {
    await this.kernel.run((db) => db.insertInto("publish_content_peers").values(toColumns(record)).execute());
  }

  /** Full-row replace by `(workspaceId, id)` — used for a rename, a URL change and a credential
   *  rotation alike, so there is exactly one write shape to reason about. */
  async update(record: PublishContentPeerRecord): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("publish_content_peers")
        .set(toColumns(record))
        .where("workspace_id", "=", record.workspaceId)
        .where("id", "=", record.id)
        .execute()
    );
  }

  async findById(input: { workspaceId: string; id: string }): Promise<PublishContentPeerRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("publish_content_peers")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(input: { workspaceId: string }): Promise<PublishContentPeerRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("publish_content_peers").selectAll().where("workspace_id", "=", input.workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  /** Idempotent — deleting an already-absent row is not an error. */
  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("publish_content_peers")
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .execute()
    );
  }
}

/** The publish-content peer repo on `kernel`'s database, whichever dialect. */
export function publishContentPeerRepoFor(kernel: ContentKernel): PublishContentPeerRepoPort {
  return new SqlPublishContentPeerRepo(kernel);
}
