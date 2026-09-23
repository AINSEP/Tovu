import { and, eq } from "drizzle-orm";

import type { PublishContentPeerRecord, PublishContentPeerRepoPort } from "#src/features/publish-content/peers";
import { publishContentPeers } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * Real SQLite `PublishContentPeerRepoPort` adapter over `publish_content_peers`
 * (`platform/db/schema.sqlite.ts`). Mirrors `publish-credential-repo.sqlite.ts`: the four `sealed_*`
 * columns are read and written as ONE opaque group, never field-by-field, so a partially-written
 * ciphertext is not representable here.
 *
 * The group is nullable as a group: `publish_content_peers` allows a peer row with no credential
 * yet (a label + URL an operator saved before issuing a key on the peer). {@link toRecord}
 * therefore returns `sealed: null` unless ALL FOUR columns are present — a row with three of them
 * is a corrupted row, and surfacing it as `null` makes it a "no credential" refusal at the one
 * place that decrypts, rather than an AEAD error deep in the transport.
 */

type Row = typeof publishContentPeers.$inferSelect;

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Row): PublishContentPeerRecord {
  const sealed =
    row.sealedKeyId !== null && row.sealedCiphertext !== null && row.sealedNonce !== null && row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    label: row.label,
    baseUrl: row.baseUrl,
    remoteWorkspaceId: row.remoteWorkspaceId,
    sealed,
    masked: row.masked,
    aadVersion: row.aadVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** @complexity O(1). */
function toColumns(record: PublishContentPeerRecord) {
  return {
    workspaceId: record.workspaceId,
    id: record.id,
    label: record.label,
    baseUrl: record.baseUrl,
    remoteWorkspaceId: record.remoteWorkspaceId,
    sealedKeyId: record.sealed?.keyId ?? null,
    sealedCiphertext: record.sealed?.ciphertext ?? null,
    sealedNonce: record.sealed?.nonce ?? null,
    sealedAlg: record.sealed?.alg ?? null,
    masked: record.masked,
    aadVersion: record.aadVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SqlitePublishContentPeerRepo implements PublishContentPeerRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: PublishContentPeerRecord): Promise<void> {
    this.db.insert(publishContentPeers).values(toColumns(record)).run();
  }

  /** Full-row replace by `(workspaceId, id)` — used for a rename, a URL change and a credential
   *  rotation alike, so there is exactly one write shape to reason about. */
  async update(record: PublishContentPeerRecord): Promise<void> {
    this.db
      .update(publishContentPeers)
      .set(toColumns(record))
      .where(and(eq(publishContentPeers.workspaceId, record.workspaceId), eq(publishContentPeers.id, record.id)))
      .run();
  }

  async findById(input: { workspaceId: string; id: string }): Promise<PublishContentPeerRecord | null> {
    const row = this.db
      .select()
      .from(publishContentPeers)
      .where(and(eq(publishContentPeers.workspaceId, input.workspaceId), eq(publishContentPeers.id, input.id)))
      .get();
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(input: { workspaceId: string }): Promise<PublishContentPeerRecord[]> {
    return this.db
      .select()
      .from(publishContentPeers)
      .where(eq(publishContentPeers.workspaceId, input.workspaceId))
      .all()
      .map(toRecord);
  }

  /** Idempotent — deleting an already-absent row is not an error. */
  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    this.db
      .delete(publishContentPeers)
      .where(and(eq(publishContentPeers.workspaceId, input.workspaceId), eq(publishContentPeers.id, input.id)))
      .run();
  }
}
