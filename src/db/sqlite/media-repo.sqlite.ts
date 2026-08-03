import { and, eq } from "drizzle-orm";

import { assetBlobs, assetRenditions, media, transformDefinitions } from "../schema";
import type { ContentDb } from "./content-db";
import { findOneBy } from "./repo-helpers";
import type { UUID } from "@jini-ai/cms/core";
import type {
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
  MediaRepoPort,
  TransformDefinitionRepoPort,
  AssetBlobRecord,
  AssetBlobStatus,
  AssetRenditionRecord,
  MediaRecord,
  MediaStatus,
  TransformDefinitionRecord,
  TransformParams,
} from "@jini-ai/cms/media";

/**
 * @file ADR-046 Phase 1 — real SQLite adapters for the `media` library's four route-consumed
 * repo ports (ADR-006 rule-of-two "second adapter" half; `media/repo.memory.ts`'s in-memory
 * doubles are the first — the only implementations that existed before this file, per
 * `media/ports.ts`'s own "SQLite adapter is deferred" disclosure).
 *
 * `BlobGcJournalRepoPort` (the fifth media port) is deliberately NOT given a SQLite adapter here —
 * `RouteDeps` has no `blobGcJournalRepo` field and no composition root wires one; the real
 * journaled-GC protocol (ADR-027 §5) itself is still a disclosed, deferred build, not just its
 * persistence. Wiring an adapter nothing calls is out of scope (mirrors SPEC-025's identical
 * `SqliteMemberConsentRepo` scope decision).
 *
 * Architectural role:
 * Infrastructure adapters. `media` never imports this file — it depends only on the ports;
 * composition roots (`server/deps.ts`) bind the concrete classes.
 */

function toMediaRecord(row: typeof media.$inferSelect): MediaRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    alt: row.alt,
    caption: row.caption,
    credit: row.credit,
    source: { sha256: row.sourceSha256 },
    status: row.status as MediaStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class SqliteMediaRepo implements MediaRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<MediaRecord | null> {
    return findOneBy(this.db, media, [eq(media.workspaceId, required.workspaceId), eq(media.id, required.id)], toMediaRecord);
  }

  async list(required: { workspaceId: UUID }): Promise<MediaRecord[]> {
    return this.db.select().from(media).where(eq(media.workspaceId, required.workspaceId)).all().map(toMediaRecord);
  }

  async save(record: MediaRecord): Promise<void> {
    const existing = await this.findById({ workspaceId: record.workspaceId, id: record.id });
    const values = {
      id: record.id,
      workspaceId: record.workspaceId,
      title: record.title,
      alt: record.alt,
      caption: record.caption,
      credit: record.credit,
      sourceSha256: record.source.sha256,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      version: record.version,
    };
    if (existing) {
      this.db.update(media).set(values).where(and(eq(media.workspaceId, record.workspaceId), eq(media.id, record.id))).run();
    } else {
      this.db.insert(media).values(values).run();
    }
  }

  async remove(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.db.delete(media).where(and(eq(media.workspaceId, required.workspaceId), eq(media.id, required.id))).run();
  }
}

function toAssetBlobRecord(row: typeof assetBlobs.$inferSelect): AssetBlobRecord {
  const record: AssetBlobRecord = {
    id: row.id,
    workspaceId: row.workspaceId,
    sha256: row.sha256,
    storageKey: row.storageKey,
    createdByPrincipal: row.createdByPrincipal,
    createdAt: row.createdAt,
    status: row.status as AssetBlobStatus,
  };
  // Omitted entirely when unset, not set to explicit `undefined` — a key present-but-`undefined`
  // is NOT deep-equal to an absent key under `assert.deepStrictEqual` (see origin-repo.sqlite.ts's
  // identical fix for the same class of bug).
  if (row.tombstonedAt != null) record.tombstonedAt = row.tombstonedAt;
  return record;
}

export class SqliteAssetBlobRepo implements AssetBlobRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByHash(required: { workspaceId: UUID; sha256: string }): Promise<AssetBlobRecord | null> {
    return findOneBy(
      this.db,
      assetBlobs,
      [eq(assetBlobs.workspaceId, required.workspaceId), eq(assetBlobs.sha256, required.sha256)],
      toAssetBlobRecord
    );
  }

  async list(required: { workspaceId: UUID }): Promise<AssetBlobRecord[]> {
    return this.db.select().from(assetBlobs).where(eq(assetBlobs.workspaceId, required.workspaceId)).all().map(toAssetBlobRecord);
  }

  async save(record: AssetBlobRecord): Promise<void> {
    const existing = await this.findByHash({ workspaceId: record.workspaceId, sha256: record.sha256 });
    const values = {
      id: record.id,
      workspaceId: record.workspaceId,
      sha256: record.sha256,
      storageKey: record.storageKey,
      createdByPrincipal: record.createdByPrincipal,
      createdAt: record.createdAt,
      status: record.status,
      tombstonedAt: record.tombstonedAt ?? null,
    };
    if (existing) {
      this.db
        .update(assetBlobs)
        .set(values)
        .where(and(eq(assetBlobs.workspaceId, record.workspaceId), eq(assetBlobs.sha256, record.sha256)))
        .run();
    } else {
      this.db.insert(assetBlobs).values(values).run();
    }
  }

  async remove(required: { workspaceId: UUID; sha256: string }): Promise<void> {
    this.db.delete(assetBlobs).where(and(eq(assetBlobs.workspaceId, required.workspaceId), eq(assetBlobs.sha256, required.sha256))).run();
  }
}

function toAssetRenditionRecord(row: typeof assetRenditions.$inferSelect): AssetRenditionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    assetId: row.assetId,
    transformName: row.transformName,
    version: row.version,
    storageKey: row.storageKey,
    createdAt: row.createdAt,
  };
}

export class SqliteAssetRenditionRepo implements AssetRenditionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByAsset(required: { workspaceId: UUID; assetId: UUID }): Promise<AssetRenditionRecord[]> {
    return this.db
      .select()
      .from(assetRenditions)
      .where(and(eq(assetRenditions.workspaceId, required.workspaceId), eq(assetRenditions.assetId, required.assetId)))
      .all()
      .map(toAssetRenditionRecord);
  }

  async findOne(required: { workspaceId: UUID; assetId: UUID; transformName: string; version: number }): Promise<AssetRenditionRecord | null> {
    return findOneBy(
      this.db,
      assetRenditions,
      [
        eq(assetRenditions.workspaceId, required.workspaceId),
        eq(assetRenditions.assetId, required.assetId),
        eq(assetRenditions.transformName, required.transformName),
        eq(assetRenditions.version, required.version),
      ],
      toAssetRenditionRecord
    );
  }

  async save(record: AssetRenditionRecord): Promise<void> {
    const existing = await findOneBy(this.db, assetRenditions, [eq(assetRenditions.id, record.id)], toAssetRenditionRecord);
    const values = {
      id: record.id,
      workspaceId: record.workspaceId,
      assetId: record.assetId,
      transformName: record.transformName,
      version: record.version,
      storageKey: record.storageKey,
      createdAt: record.createdAt,
    };
    if (existing) {
      this.db.update(assetRenditions).set(values).where(eq(assetRenditions.id, record.id)).run();
    } else {
      this.db.insert(assetRenditions).values(values).run();
    }
  }

  async removeByAsset(required: { workspaceId: UUID; assetId: UUID }): Promise<void> {
    this.db
      .delete(assetRenditions)
      .where(and(eq(assetRenditions.workspaceId, required.workspaceId), eq(assetRenditions.assetId, required.assetId)))
      .run();
  }
}

function toTransformDefinitionRecord(row: typeof transformDefinitions.$inferSelect): TransformDefinitionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    version: row.version,
    params: JSON.parse(row.paramsJson) as TransformParams,
    owner: row.owner,
    createdAt: row.createdAt,
  };
}

export class SqliteTransformDefinitionRepo implements TransformDefinitionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByName(required: { workspaceId: UUID; name: string }): Promise<TransformDefinitionRecord[]> {
    return this.db
      .select()
      .from(transformDefinitions)
      .where(and(eq(transformDefinitions.workspaceId, required.workspaceId), eq(transformDefinitions.name, required.name)))
      .all()
      .map(toTransformDefinitionRecord);
  }

  async findByNameVersion(required: { workspaceId: UUID; name: string; version: number }): Promise<TransformDefinitionRecord | null> {
    return findOneBy(
      this.db,
      transformDefinitions,
      [
        eq(transformDefinitions.workspaceId, required.workspaceId),
        eq(transformDefinitions.name, required.name),
        eq(transformDefinitions.version, required.version),
      ],
      toTransformDefinitionRecord
    );
  }

  /** Append-only — the unique `(workspace_id, name, version)` index makes a duplicate insert
   * fail at the storage layer (SQLite unique-constraint violation), not just by convention. */
  async insert(record: TransformDefinitionRecord): Promise<void> {
    try {
      this.db
        .insert(transformDefinitions)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          name: record.name,
          version: record.version,
          paramsJson: JSON.stringify(record.params),
          owner: record.owner,
          createdAt: record.createdAt,
        })
        .run();
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new Error(
          `transform_registry row (workspace=${record.workspaceId}, name=${record.name}, v${record.version}) already exists — append-only violation`
        );
      }
      throw err;
    }
  }
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/.test(err.message);
}
