import { and, desc, eq, inArray } from "drizzle-orm";

import { assetBlobs, assetRenditions, media, mediaSlugHistory, transformDefinitions } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";
import { findOneBy } from "./repo-helpers.js";
import type { MediaContentTypeStorePort } from "#src/features/media/content-type-store";
import type { VersionedMediaRepoPort } from "#src/features/media/versioned-media-repo";
import type { UUID } from "@jini-ai/cms/core";
import { MediaConflictError } from "@jini-ai/cms/media";
import type {
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
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
    // `row.slug` is nullable in the DB (see `schema.sqlite.ts`'s doc: backfilled out of band, not on
    // write) but `MediaRecord.slug` is non-nullable in the domain model — every row this repo
    // itself ever writes always has a real slug (`SqliteMediaRepo.save()`'s `values` below never
    // omits it), so a `null` here can only mean a genuinely pre-backfill row. Falling back to the
    // row's own `id` rather than `""`/`"untitled"` keeps the fallback ALREADY unique (ids are
    // primary keys) without a repo-layer uniqueness check of its own.
    slug: row.slug ?? row.id,
    alt: row.alt,
    caption: row.caption,
    credit: row.credit,
    source: { sha256: row.sourceSha256 },
    status: row.status as MediaStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
    width: row.width,
    height: row.height,
    cssClass: row.cssClass,
    htmlAttributes: row.htmlAttributes,
  };
}

/**
 * Extracted from `save()` (this commit) so `save`, `saveIfVersion`, and `insertIfAbsent` persist
 * the IDENTICAL columns from the identical record — a second hand-maintained copy of this mapping
 * is how one write path silently stops honouring a column the others still write. Mirrors
 * `repo.sqlite.ts`'s (post) identical `toRow` extraction for the same reason.
 *
 * @complexity O(1) — a fixed field-by-field copy, no iteration.
 */
function toMediaRow(record: MediaRecord) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    title: record.title,
    slug: record.slug,
    alt: record.alt,
    caption: record.caption,
    credit: record.credit,
    sourceSha256: record.source.sha256,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    width: record.width,
    height: record.height,
    cssClass: record.cssClass,
    htmlAttributes: record.htmlAttributes,
  };
}

/**
 * Translates a SQLite unique-constraint violation on `idx_media_workspace_slug` into the same
 * `MediaConflictError` the app-level `findBySlug` courtesy check throws, so every caller of every
 * write method on this repo (`save`, `saveIfVersion`, `insertIfAbsent`) handles one error shape
 * regardless of which layer actually caught the collision. Re-throws anything that is not a unique-
 * constraint violation unchanged.
 *
 * @complexity O(1).
 */
function translateSlugConflict(err: unknown, slug: string): never {
  if (isUniqueConstraintViolation(err)) {
    throw new MediaConflictError(`slug '${slug}' is already used by another media asset in this workspace`);
  }
  throw err;
}

/** Same derivation `media-provider-credential-repo.sqlite.ts`'s own `ContentDbTx` uses — the Drizzle
 *  transaction callback argument's type, extracted structurally since Drizzle does not export it
 *  directly. */
type ContentDbTx = Parameters<Parameters<ContentDb["transaction"]>[0]>[0];

/** The `media_slug_history` row currently claiming `slug` in this workspace, or `null` if none
 *  (readable-slugs plan, S2a — see `VersionedMediaRepoPort.listRetiredSlugs`'s doc for the full
 *  rename-safety contract this and its sibling helpers below implement). */
function findSlugClaimant(tx: ContentDbTx, workspaceId: UUID, slug: string): typeof mediaSlugHistory.$inferSelect | null {
  return (
    tx
      .select()
      .from(mediaSlugHistory)
      .where(and(eq(mediaSlugHistory.workspaceId, workspaceId), eq(mediaSlugHistory.slug, slug)))
      .get() ?? null
  );
}

/** Throws `MediaConflictError` — the same shape a live-row `idx_media_workspace_slug` violation
 *  throws — when `claimant` belongs to a DIFFERENT asset. A `null` claimant, or one that already
 *  belongs to `mediaId` (reclaiming its own old slug), is fine. */
function assertSlugReclaimable(claimant: typeof mediaSlugHistory.$inferSelect | null, mediaId: UUID, slug: string): void {
  if (claimant && claimant.mediaId !== mediaId) {
    throw new MediaConflictError(`slug '${slug}' is already used by another media asset in this workspace`);
  }
}

/** Removes a slug from `media_slug_history` — called once its claimant has actually reclaimed it
 *  (the row write that reclaims it has already landed in the same transaction). */
function deleteHistoryRow(tx: ContentDbTx, workspaceId: UUID, slug: string): void {
  tx.delete(mediaSlugHistory).where(and(eq(mediaSlugHistory.workspaceId, workspaceId), eq(mediaSlugHistory.slug, slug))).run();
}

/** Moves `oldSlug` into `media_slug_history` for `mediaId`, unless the write left the slug
 *  unchanged or there was no prior slug (a brand-new row) — mirrors
 *  `InMemoryVersionedMediaRepo`'s identical `retireSlug` private method. */
function retireSlug(tx: ContentDbTx, workspaceId: UUID, mediaId: UUID, oldSlug: string | null, newSlug: string, retiredAt: string): void {
  if (!oldSlug || oldSlug === newSlug) return;
  tx.insert(mediaSlugHistory).values({ workspaceId, slug: oldSlug, mediaId, retiredAt }).run();
}

export class SqliteMediaRepo implements VersionedMediaRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<MediaRecord | null> {
    return findOneBy(this.db, media, [eq(media.workspaceId, required.workspaceId), eq(media.id, required.id)], toMediaRecord);
  }

  /**
   * Second lookup key (`MediaRepoPort.findBySlug`, 2026-09-07) — same `findOneBy` shape as
   * `findById`, just against `idx_media_workspace_slug` instead of the primary key. Falls back to
   * `media_slug_history` (S2a, 2026-09-23) when no LIVE row currently holds `slug`, so a retired
   * slug keeps resolving to the asset that retired it — see
   * `VersionedMediaRepoPort.listRetiredSlugs`'s doc for the full rename-safety contract.
   */
  async findBySlug(required: { workspaceId: UUID; slug: string }): Promise<MediaRecord | null> {
    const live = findOneBy(this.db, media, [eq(media.workspaceId, required.workspaceId), eq(media.slug, required.slug)], toMediaRecord);
    if (live) return live;
    const retired = findOneBy(
      this.db,
      mediaSlugHistory,
      [eq(mediaSlugHistory.workspaceId, required.workspaceId), eq(mediaSlugHistory.slug, required.slug)],
      (row) => row
    );
    if (!retired) return null;
    return this.findById({ workspaceId: required.workspaceId, id: retired.mediaId });
  }

  /**
   * Newest-first (owner-directed, 2026-09-11: "have a sort by to see our most recent images" —
   * she checks this list right after an agent plugin generates one, e.g. Higgsfield's
   * `media_import_from_url`, so "what did I just make" has to land at the top with no extra
   * step). `MediaRepoPort.list()`'s own doc (`@jini-ai/cms/media/ports.ts`) never promised any
   * particular order, and no caller in this codebase sorted the result itself (confirmed: neither
   * `listMedia()` in `@jini-ai/cms/media/media-service.ts`, nor `media_list_assets`'s handler in
   * that same package's `tool-registrations.ts`, nor the admin route below, nor
   * `apps/admin/src/features/media/hooks/use-media.hooks.ts` on the client) — so choosing newest-
   * first here is additive, not a documented-contract break, and it is the ONE choke point both
   * consumers share: `media_list_assets` and the admin `GET .../media` route both resolve to
   * `listMedia()` -> `deps.mediaRepo.list()`, and production wires exactly one `MediaRepoPort`
   * implementation (`composition/deps.ts`'s `mediaRepo: new SqliteMediaRepo(db)`) — fixing it here
   * reaches both surfaces without a second change.
   *
   * `desc(media.id)` is a tiebreaker only, mirroring `database-journal-repo.ts`'s identical
   * `createdAt` + `id` compound `orderBy` — `id` is a random UUID (`idGen.newId()`), not
   * chronological, so it cannot repair a same-instant tie into true creation order; it only makes
   * repeated queries against an unchanged table return rows in the same order (SQLite gives no such
   * guarantee on its own once two rows share a sort key). `createdAt` itself is
   * `clock.nowIso()` = `Date.prototype.toISOString()`, millisecond-precision and never rewritten
   * after a row's first `save()` (`SqliteMediaRepo.save()` above always persists the caller's
   * `record.createdAt` verbatim, update or insert alike), so a same-millisecond collision is
   * possible only for two rows created by the same batch call in the same tick — rare enough that
   * the tiebreaker's job is determinism, not correctness of "which is newer."
   *
   * Deliberately NOT added to `InMemoryMediaRepo.list()` (`@jini-ai/cms/media/repo.memory.ts`):
   * that adapter lives in the separate Jini package/repo this file's own header says composition
   * roots bind against, not maintain, and production never constructs it (see this comment's own
   * "one choke point" note above) — a disclosed, Tovu-scoped fix, not a silent rule-of-two parity
   * gap. `features/media/__tests__/repo.contract.test.ts`'s shared `runMediaSuite` still runs both
   * adapters through the SAME order-agnostic assertions it always has; the new ordering assertion
   * is added as a `[sqlite]`-only test there, following that file's own established pattern for
   * adapter-specific behavior (see its two existing slug-conflict tests).
   */
  async list(required: { workspaceId: UUID }): Promise<MediaRecord[]> {
    return this.db
      .select()
      .from(media)
      .where(eq(media.workspaceId, required.workspaceId))
      .orderBy(desc(media.createdAt), desc(media.id))
      .all()
      .map(toMediaRecord);
  }

  /**
   * S2a (readable slugs, 2026-09-23): the read, the retired-slug conflict check, the write, and the
   * slug-history move (reclaim the new slug out of history if it was retired; retire the row's PRIOR
   * slug if this write actually changes it) all run inside ONE `db.transaction` — never a separate
   * `findById()`/history-read followed by a separate write, the same "one atomic step, not a
   * check-then-write pair" reasoning `saveIfVersion`'s own doc gives.
   */
  async save(record: MediaRecord): Promise<void> {
    const values = toMediaRow(record);
    // `updateMediaMetadata`'s own `findBySlug` check (see `@jini-ai/cms/media`'s `media-service.ts`)
    // is a friendly-error courtesy, not the enforcement — `idx_media_workspace_slug` (a LIVE
    // collision) and `assertSlugReclaimable` (a RETIRED-slug collision) are. A caller that races
    // past those checks (or bypasses the service entirely) hits the real DB constraint here;
    // translated to the SAME `MediaConflictError` type the app-level check throws, so every caller
    // handles one error shape regardless of which layer actually caught the collision.
    try {
      this.db.transaction((tx) => {
        const existingRow = tx
          .select()
          .from(media)
          .where(and(eq(media.workspaceId, record.workspaceId), eq(media.id, record.id)))
          .get();
        const claimant = findSlugClaimant(tx, record.workspaceId, record.slug);
        assertSlugReclaimable(claimant, record.id, record.slug);
        if (existingRow) {
          tx.update(media).set(values).where(and(eq(media.workspaceId, record.workspaceId), eq(media.id, record.id))).run();
        } else {
          tx.insert(media).values(values).run();
        }
        if (claimant) deleteHistoryRow(tx, record.workspaceId, record.slug);
        retireSlug(tx, record.workspaceId, record.id, existingRow?.slug ?? null, record.slug, record.updatedAt);
      });
    } catch (err) {
      translateSlugConflict(err, record.slug);
    }
  }

  /**
   * See `VersionedMediaRepoPort.saveIfVersion`'s own doc for the contract. An
   * `UPDATE … WHERE workspace_id = ? AND id = ? AND version = ?` — never the upsert `save()` above
   * uses, because an absent or already-superseded row must report `applied: false` rather than be
   * inserted or silently overwritten. The predicate and the write are ONE statement, which is the
   * whole point: a compare done in JavaScript with a write issued afterwards (this repo's `save()`,
   * called from a caller that read a stale version first) is exactly the race this method closes —
   * mirrors `features/post/repo.sqlite.ts`'s identical `saveIfVersion` for posts.
   *
   * @complexity O(1) — one statement against the `media` primary key.
   */
  async saveIfVersion(required: { record: MediaRecord; ifVersion: number }): Promise<{ applied: boolean }> {
    const { record, ifVersion } = required;
    try {
      return this.db.transaction((tx) => {
        const existingRow = tx
          .select()
          .from(media)
          .where(and(eq(media.workspaceId, record.workspaceId), eq(media.id, record.id), eq(media.version, ifVersion)))
          .get();
        if (!existingRow) return { applied: false };
        const claimant = findSlugClaimant(tx, record.workspaceId, record.slug);
        assertSlugReclaimable(claimant, record.id, record.slug);
        const result = tx
          .update(media)
          .set(toMediaRow(record))
          .where(and(eq(media.workspaceId, record.workspaceId), eq(media.id, record.id), eq(media.version, ifVersion)))
          .run();
        if (result.changes === 0) return { applied: false };
        if (claimant) deleteHistoryRow(tx, record.workspaceId, record.slug);
        retireSlug(tx, record.workspaceId, record.id, existingRow.slug, record.slug, record.updatedAt);
        return { applied: true };
      });
    } catch (err) {
      translateSlugConflict(err, record.slug);
    }
  }

  /**
   * See `VersionedMediaRepoPort.insertIfAbsent`'s own doc for the contract. The conflict target is
   * deliberately `media.id` (the primary key) and NOT a bare `onConflictDoNothing()` — an untargeted
   * call would also swallow `idx_media_workspace_slug`'s unique-constraint violation, silently
   * reporting `applied: false` for a slug collision instead of throwing `MediaConflictError` the way
   * every other write on this repo does. Precedent: `database-journal-repo.ts`'s
   * `appendInterruptedRow`, the only other `onConflictDoNothing` call in this codebase.
   *
   * @complexity O(1) — one statement against the `media` primary key.
   */
  async insertIfAbsent(record: MediaRecord): Promise<{ applied: boolean }> {
    try {
      return this.db.transaction((tx) => {
        const claimant = findSlugClaimant(tx, record.workspaceId, record.slug);
        assertSlugReclaimable(claimant, record.id, record.slug);
        const result = tx.insert(media).values(toMediaRow(record)).onConflictDoNothing({ target: media.id }).run();
        // Only drop the history row once the insert actually landed — an `applied: false` (id
        // already taken) must leave `media_slug_history` exactly as it was, same "no partial
        // effect on a refused write" rule every other branch here follows.
        if (result.changes > 0 && claimant) deleteHistoryRow(tx, record.workspaceId, record.slug);
        return { applied: result.changes > 0 };
      });
    } catch (err) {
      translateSlugConflict(err, record.slug);
    }
  }

  /** Drops the row's `media_slug_history` entries in the SAME transaction as the delete itself —
   *  S2a: "permanent delete drops that asset's history rows, which frees the name." */
  async remove(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(media).where(and(eq(media.workspaceId, required.workspaceId), eq(media.id, required.id))).run();
      tx.delete(mediaSlugHistory)
        .where(and(eq(mediaSlugHistory.workspaceId, required.workspaceId), eq(mediaSlugHistory.mediaId, required.id)))
        .run();
    });
  }

  async listRetiredSlugs(required: { workspaceId: UUID; mediaId: UUID }): Promise<string[]> {
    return this.db
      .select({ slug: mediaSlugHistory.slug })
      .from(mediaSlugHistory)
      .where(and(eq(mediaSlugHistory.workspaceId, required.workspaceId), eq(mediaSlugHistory.mediaId, required.mediaId)))
      .all()
      .map((row) => row.slug);
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
      // `content_type` is deliberately absent from `values` above, so this `.set()` leaves the
      // existing value alone. `AssetBlobRecord` is `@jini-ai/cms`'s frozen port type and has no
      // content-type field, so anything this method could put there would be `null` — and this
      // branch runs on `uploadMedia`'s dedup RESURRECT path (tombstoned -> active), which would
      // then silently erase the recorded type of a blob that is being re-referenced, not deleted.
      // The type is owned by `SqliteMediaContentTypeStore` below; this repo never writes it.
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

/**
 * `MediaContentTypeStorePort`'s SQLite adapter — reads and writes `asset_blobs.content_type`, the
 * one column on that table `SqliteAssetBlobRepo` above deliberately never touches (see its
 * `save()` comment for why the two are split rather than merged).
 *
 * No row is ever INSERTED here: the blob row is always created first by `uploadMedia`'s own
 * `blobRepo.save()` (its INV-1a "bytes before the media row" ordering guarantees it exists), so
 * `set` is a pure column UPDATE. A `set` for a sha256 with no blob row updates nothing and throws
 * nothing — the correct outcome, since there is no blob to describe.
 */
export class SqliteMediaContentTypeStore implements MediaContentTypeStorePort {
  constructor(private readonly db: ContentDb) {}

  async getMany(required: { workspaceId: UUID; sha256s: readonly string[] }): Promise<Map<string, string>> {
    if (required.sha256s.length === 0) return new Map();
    const rows = this.db
      .select({ sha256: assetBlobs.sha256, contentType: assetBlobs.contentType })
      .from(assetBlobs)
      .where(and(eq(assetBlobs.workspaceId, required.workspaceId), inArray(assetBlobs.sha256, [...required.sha256s])))
      .all();

    const found = new Map<string, string>();
    for (const row of rows) {
      // A `null` column is "not sniffed yet" and must stay ABSENT from the map rather than become
      // a null entry — the port's `getMany` contract is what lets a caller tell that apart from a
      // recorded `application/octet-stream`.
      if (row.contentType != null) found.set(row.sha256, row.contentType);
    }
    return found;
  }

  async set(required: { workspaceId: UUID; sha256: string; contentType: string }): Promise<void> {
    this.db
      .update(assetBlobs)
      .set({ contentType: required.contentType })
      .where(and(eq(assetBlobs.workspaceId, required.workspaceId), eq(assetBlobs.sha256, required.sha256)))
      .run();
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
