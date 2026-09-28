import type { Kysely, Selectable } from "kysely";

import type { ContentDatabase, AssetBlobsTable, AssetRenditionsTable, MediaSlugHistoryTable, MediaTable, TransformRegistryTable } from "../content-database.generated.js";
import type { ContentKernel } from "../content-kernel.js";
import { isUniqueViolation } from "../kernel/dialect.js";
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
 * @file ADR-046 Phase 1 — THE durable adapters for the `media` library's four route-consumed repo
 * ports (ADR-006 rule-of-two "second adapter" half; `media/repo.memory.ts`'s in-memory doubles are
 * the first) plus `MediaContentTypeStorePort`: one Kysely query body each for every dialect the
 * storage kernel drives (storage plan §4, ADR-066). `sqlite/media-repo.sqlite.ts` keeps the
 * `Sqlite*` names as thin subclasses the composition root builds from the content db handle.
 *
 * `BlobGcJournalRepoPort` (the fifth media port) is deliberately NOT given an adapter here —
 * `RouteDeps` has no `blobGcJournalRepo` field and no composition root wires one; the real
 * journaled-GC protocol (ADR-027 §5) itself is still a disclosed, deferred build, not just its
 * persistence. Wiring an adapter nothing calls is out of scope (mirrors SPEC-025's identical
 * `SqliteMemberConsentRepo` scope decision).
 *
 * JSON: `transform_registry.params_json` is compact JSON text (a Postgres `jsonb`), always parsed
 * on read, so jsonb's key order changes nothing a caller sees.
 *
 * Architectural role:
 * Infrastructure adapters. `media` never imports this file — it depends only on the ports;
 * composition roots (`server/deps.ts`) bind the concrete classes.
 */

type ContentQueries = Kysely<ContentDatabase>;

function toMediaRecord(row: Selectable<MediaTable>): MediaRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    // `row.slug` is nullable in the DB (see `schema.sqlite.ts`'s doc: backfilled out of band, not on
    // write) but `MediaRecord.slug` is non-nullable in the domain model — every row this repo
    // itself ever writes always has a real slug (`save()`'s values below never omit it), so a `null`
    // here can only mean a genuinely pre-backfill row. Falling back to the row's own `id` rather
    // than `""`/`"untitled"` keeps the fallback ALREADY unique (ids are primary keys) without a
    // repo-layer uniqueness check of its own.
    slug: row.slug ?? row.id,
    alt: row.alt,
    caption: row.caption,
    credit: row.credit,
    source: { sha256: row.source_sha256 },
    status: row.status as MediaStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    width: row.width,
    height: row.height,
    cssClass: row.css_class,
    htmlAttributes: row.html_attributes,
  };
}

/**
 * Extracted so `save`, `saveIfVersion`, and `insertIfAbsent` persist the IDENTICAL columns from the
 * identical record — a second hand-maintained copy of this mapping is how one write path silently
 * stops honouring a column the others still write. Mirrors the post repo's identical `toRow`.
 *
 * @complexity O(1) — a fixed field-by-field copy, no iteration.
 */
function toMediaRow(record: MediaRecord): MediaTable {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    title: record.title,
    slug: record.slug,
    alt: record.alt,
    caption: record.caption,
    credit: record.credit,
    source_sha256: record.source.sha256,
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    version: record.version,
    width: record.width,
    height: record.height,
    css_class: record.cssClass,
    html_attributes: record.htmlAttributes,
  };
}

/**
 * Translates a unique-constraint violation on `idx_media_workspace_slug` (any dialect) into the same
 * `MediaConflictError` the app-level `findBySlug` courtesy check throws, so every caller of every
 * write method on this repo (`save`, `saveIfVersion`, `insertIfAbsent`) handles one error shape
 * regardless of which layer actually caught the collision. Re-throws anything that is not a unique-
 * constraint violation unchanged.
 *
 * @complexity O(1).
 */
function translateSlugConflict(err: unknown, slug: string): never {
  if (isUniqueViolation(err)) {
    throw new MediaConflictError(`slug '${slug}' is already used by another media asset in this workspace`);
  }
  throw err;
}

/** The `media_slug_history` row currently claiming `slug` in this workspace, or `null` if none
 *  (readable-slugs plan, S2a — see `VersionedMediaRepoPort.listRetiredSlugs`'s doc for the full
 *  rename-safety contract this and its sibling helpers below implement). */
async function findSlugClaimant(db: ContentQueries, workspaceId: UUID, slug: string): Promise<Selectable<MediaSlugHistoryTable> | null> {
  const row = await db
    .selectFrom("media_slug_history")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("slug", "=", slug)
    .limit(1)
    .executeTakeFirst();
  return row ?? null;
}

/** Throws `MediaConflictError` — the same shape a live-row `idx_media_workspace_slug` violation
 *  throws — when `claimant` belongs to a DIFFERENT asset. A `null` claimant, or one that already
 *  belongs to `mediaId` (reclaiming its own old slug), is fine. */
function assertSlugReclaimable(claimant: Selectable<MediaSlugHistoryTable> | null, mediaId: UUID, slug: string): void {
  if (claimant && claimant.media_id !== mediaId) {
    throw new MediaConflictError(`slug '${slug}' is already used by another media asset in this workspace`);
  }
}

/** Removes a slug from `media_slug_history` — called once its claimant has actually reclaimed it
 *  (the row write that reclaims it has already landed in the same transaction). */
async function deleteHistoryRow(db: ContentQueries, workspaceId: UUID, slug: string): Promise<void> {
  await db.deleteFrom("media_slug_history").where("workspace_id", "=", workspaceId).where("slug", "=", slug).execute();
}

/** Moves `oldSlug` into `media_slug_history` for `mediaId`, unless the write left the slug
 *  unchanged or there was no prior slug (a brand-new row) — mirrors
 *  `InMemoryVersionedMediaRepo`'s identical `retireSlug` private method. */
async function retireSlug(db: ContentQueries, workspaceId: UUID, mediaId: UUID, oldSlug: string | null, newSlug: string, retiredAt: string): Promise<void> {
  if (!oldSlug || oldSlug === newSlug) return;
  await db.insertInto("media_slug_history").values({ workspace_id: workspaceId, slug: oldSlug, media_id: mediaId, retired_at: retiredAt }).execute();
}

/** The `lockKey` every slug-claiming write in one workspace takes: the history read, the conflict
 *  check and the write must not interleave with another claimant's (Postgres; SQLite's write lock
 *  already serializes them). */
function slugLockKey(workspaceId: UUID): string {
  return `media_slugs:${workspaceId}`;
}

export class SqlMediaRepo implements VersionedMediaRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<MediaRecord | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("media").selectAll().where("workspace_id", "=", required.workspaceId).where("id", "=", required.id).limit(1).executeTakeFirst()
    );
    return row ? toMediaRecord(row) : null;
  }

  /**
   * Second lookup key (`MediaRepoPort.findBySlug`, 2026-09-07) — same shape as `findById`, just
   * against `idx_media_workspace_slug` instead of the primary key. Falls back to
   * `media_slug_history` (S2a, 2026-09-23) when no LIVE row currently holds `slug`, so a retired
   * slug keeps resolving to the asset that retired it — see
   * `VersionedMediaRepoPort.listRetiredSlugs`'s doc for the full rename-safety contract.
   */
  async findBySlug(required: { workspaceId: UUID; slug: string }): Promise<MediaRecord | null> {
    const live = await this.kernel.run((db) =>
      db.selectFrom("media").selectAll().where("workspace_id", "=", required.workspaceId).where("slug", "=", required.slug).limit(1).executeTakeFirst()
    );
    if (live) return toMediaRecord(live);
    const retired = await this.kernel.run((db) => findSlugClaimant(db, required.workspaceId, required.slug));
    if (!retired) return null;
    return this.findById({ workspaceId: required.workspaceId, id: retired.media_id });
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
   * `id desc` is a tiebreaker only, mirroring `database-journal-repo.ts`'s identical
   * `createdAt` + `id` compound `orderBy` — `id` is a random UUID (`idGen.newId()`), not
   * chronological, so it cannot repair a same-instant tie into true creation order; it only makes
   * repeated queries against an unchanged table return rows in the same order (no database gives
   * such a guarantee on its own once two rows share a sort key). `createdAt` itself is
   * `clock.nowIso()` = `Date.prototype.toISOString()`, millisecond-precision and never rewritten
   * after a row's first `save()` (`save()` above always persists the caller's `record.createdAt`
   * verbatim, update or insert alike), so a same-millisecond collision is possible only for two
   * rows created by the same batch call in the same tick — rare enough that the tiebreaker's job
   * is determinism, not correctness of "which is newer."
   *
   * Deliberately NOT added to `InMemoryMediaRepo.list()` (`@jini-ai/cms/media/repo.memory.ts`):
   * that adapter lives in the separate Jini package/repo this file's own header says composition
   * roots bind against, not maintain, and production never constructs it (see this comment's own
   * "one choke point" note above) — a disclosed, Tovu-scoped fix, not a silent rule-of-two parity
   * gap. `features/media/__tests__/repo.contract.test.ts`'s shared `runMediaSuite` still runs both
   * adapters through the SAME order-agnostic assertions it always has; the ordering assertion is a
   * durable-adapter-only test there, following that file's own established pattern for
   * adapter-specific behavior (see its slug-conflict tests).
   */
  async list(required: { workspaceId: UUID }): Promise<MediaRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("media").selectAll().where("workspace_id", "=", required.workspaceId).orderBy("created_at", "desc").orderBy("id", "desc").execute()
    );
    return rows.map(toMediaRecord);
  }

  /**
   * S2a (readable slugs, 2026-09-23): the read, the retired-slug conflict check, the write, and the
   * slug-history move (reclaim the new slug out of history if it was retired; retire the row's PRIOR
   * slug if this write actually changes it) all run inside ONE kernel transaction under the
   * workspace's slug lock — never a separate `findById()`/history-read followed by a separate write,
   * the same "one atomic step, not a check-then-write pair" reasoning `saveIfVersion`'s own doc gives.
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
      await this.kernel.transaction(async () => {
        await this.kernel.lockKey(slugLockKey(record.workspaceId));
        await this.kernel.run(async (db) => {
          const existingRow = await db
            .selectFrom("media")
            .select("slug")
            .where("workspace_id", "=", record.workspaceId)
            .where("id", "=", record.id)
            .executeTakeFirst();
          const claimant = await findSlugClaimant(db, record.workspaceId, record.slug);
          assertSlugReclaimable(claimant, record.id, record.slug);
          if (existingRow) {
            await db.updateTable("media").set(values).where("workspace_id", "=", record.workspaceId).where("id", "=", record.id).execute();
          } else {
            await db.insertInto("media").values(values).execute();
          }
          if (claimant) await deleteHistoryRow(db, record.workspaceId, record.slug);
          await retireSlug(db, record.workspaceId, record.id, existingRow?.slug ?? null, record.slug, record.updatedAt);
        });
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
   * mirrors the post repo's identical `saveIfVersion`.
   *
   * @complexity O(1) — one statement against the `media` primary key.
   */
  async saveIfVersion(required: { record: MediaRecord; ifVersion: number }): Promise<{ applied: boolean }> {
    const { record, ifVersion } = required;
    try {
      return await this.kernel.transaction(async () => {
        await this.kernel.lockKey(slugLockKey(record.workspaceId));
        return this.kernel.run(async (db) => {
          const existingRow = await db
            .selectFrom("media")
            .select("slug")
            .where("workspace_id", "=", record.workspaceId)
            .where("id", "=", record.id)
            .where("version", "=", ifVersion)
            .executeTakeFirst();
          if (!existingRow) return { applied: false };
          const claimant = await findSlugClaimant(db, record.workspaceId, record.slug);
          assertSlugReclaimable(claimant, record.id, record.slug);
          const updated = await db
            .updateTable("media")
            .set(toMediaRow(record))
            .where("workspace_id", "=", record.workspaceId)
            .where("id", "=", record.id)
            .where("version", "=", ifVersion)
            .returning("id")
            .execute();
          if (updated.length === 0) return { applied: false };
          if (claimant) await deleteHistoryRow(db, record.workspaceId, record.slug);
          await retireSlug(db, record.workspaceId, record.id, existingRow.slug, record.slug, record.updatedAt);
          return { applied: true };
        });
      });
    } catch (err) {
      translateSlugConflict(err, record.slug);
    }
  }

  /**
   * See `VersionedMediaRepoPort.insertIfAbsent`'s own doc for the contract. The conflict target is
   * deliberately `id` (the primary key) and NOT an untargeted `ON CONFLICT DO NOTHING` — an
   * untargeted one would also swallow `idx_media_workspace_slug`'s unique-constraint violation,
   * silently reporting `applied: false` for a slug collision instead of throwing
   * `MediaConflictError` the way every other write on this repo does.
   *
   * @complexity O(1) — one statement against the `media` primary key.
   */
  async insertIfAbsent(record: MediaRecord): Promise<{ applied: boolean }> {
    try {
      return await this.kernel.transaction(async () => {
        await this.kernel.lockKey(slugLockKey(record.workspaceId));
        return this.kernel.run(async (db) => {
          const claimant = await findSlugClaimant(db, record.workspaceId, record.slug);
          assertSlugReclaimable(claimant, record.id, record.slug);
          const inserted = await db
            .insertInto("media")
            .values(toMediaRow(record))
            .onConflict((oc) => oc.column("id").doNothing())
            .returning("id")
            .execute();
          // Only drop the history row once the insert actually landed — an `applied: false` (id
          // already taken) must leave `media_slug_history` exactly as it was, same "no partial
          // effect on a refused write" rule every other branch here follows.
          if (inserted.length > 0 && claimant) await deleteHistoryRow(db, record.workspaceId, record.slug);
          return { applied: inserted.length > 0 };
        });
      });
    } catch (err) {
      translateSlugConflict(err, record.slug);
    }
  }

  /** Drops the row's `media_slug_history` entries in the SAME transaction as the delete itself —
   *  S2a: "permanent delete drops that asset's history rows, which frees the name." */
  async remove(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.run(async (db) => {
        await db.deleteFrom("media").where("workspace_id", "=", required.workspaceId).where("id", "=", required.id).execute();
        await db.deleteFrom("media_slug_history").where("workspace_id", "=", required.workspaceId).where("media_id", "=", required.id).execute();
      });
    });
  }

  async listRetiredSlugs(required: { workspaceId: UUID; mediaId: UUID }): Promise<string[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("media_slug_history").select("slug").where("workspace_id", "=", required.workspaceId).where("media_id", "=", required.mediaId).execute()
    );
    return rows.map((row) => row.slug);
  }
}

function toAssetBlobRecord(row: Selectable<AssetBlobsTable>): AssetBlobRecord {
  const record: AssetBlobRecord = {
    id: row.id,
    workspaceId: row.workspace_id,
    sha256: row.sha256,
    storageKey: row.storage_key,
    createdByPrincipal: row.created_by_principal,
    createdAt: row.created_at,
    status: row.status as AssetBlobStatus,
  };
  // Omitted entirely when unset, not set to explicit `undefined` — a key present-but-`undefined`
  // is NOT deep-equal to an absent key under `assert.deepStrictEqual` (see origin-repo.ts's
  // identical fix for the same class of bug).
  if (row.tombstoned_at != null) record.tombstonedAt = row.tombstoned_at;
  return record;
}

export class SqlAssetBlobRepo implements AssetBlobRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByHash(required: { workspaceId: UUID; sha256: string }): Promise<AssetBlobRecord | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("asset_blobs").selectAll().where("workspace_id", "=", required.workspaceId).where("sha256", "=", required.sha256).limit(1).executeTakeFirst()
    );
    return row ? toAssetBlobRecord(row) : null;
  }

  async list(required: { workspaceId: UUID }): Promise<AssetBlobRecord[]> {
    const rows = await this.kernel.run((db) => db.selectFrom("asset_blobs").selectAll().where("workspace_id", "=", required.workspaceId).execute());
    return rows.map(toAssetBlobRecord);
  }

  /** Update-or-insert by `(workspace_id, sha256)`: the read and the write run in one kernel
   *  transaction under a lock on that hash, so two saves of the same blob cannot both insert. */
  async save(record: AssetBlobRecord): Promise<void> {
    const values = {
      id: record.id,
      workspace_id: record.workspaceId,
      sha256: record.sha256,
      storage_key: record.storageKey,
      created_by_principal: record.createdByPrincipal,
      created_at: record.createdAt,
      status: record.status,
      tombstoned_at: record.tombstonedAt ?? null,
    };
    await this.kernel.transaction(async () => {
      await this.kernel.lockKey(`asset_blobs:${record.workspaceId}:${record.sha256}`);
      const existing = await this.findByHash({ workspaceId: record.workspaceId, sha256: record.sha256 });
      await this.kernel.run(async (db) => {
        if (existing) {
          // `content_type` is deliberately absent from `values` above, so this `.set()` leaves the
          // existing value alone. `AssetBlobRecord` is `@jini-ai/cms`'s frozen port type and has no
          // content-type field, so anything this method could put there would be `null` — and this
          // branch runs on `uploadMedia`'s dedup RESURRECT path (tombstoned -> active), which would
          // then silently erase the recorded type of a blob that is being re-referenced, not deleted.
          // The type is owned by `SqlMediaContentTypeStore` below; this repo never writes it.
          await db.updateTable("asset_blobs").set(values).where("workspace_id", "=", record.workspaceId).where("sha256", "=", record.sha256).execute();
        } else {
          await db.insertInto("asset_blobs").values(values).execute();
        }
      });
    });
  }

  async remove(required: { workspaceId: UUID; sha256: string }): Promise<void> {
    await this.kernel.run((db) =>
      db.deleteFrom("asset_blobs").where("workspace_id", "=", required.workspaceId).where("sha256", "=", required.sha256).execute()
    );
  }
}

/**
 * `MediaContentTypeStorePort`'s durable adapter — reads and writes `asset_blobs.content_type`, the
 * one column on that table `SqlAssetBlobRepo` above deliberately never touches (see its `save()`
 * comment for why the two are split rather than merged).
 *
 * No row is ever INSERTED here: the blob row is always created first by `uploadMedia`'s own
 * `blobRepo.save()` (its INV-1a "bytes before the media row" ordering guarantees it exists), so
 * `set` is a pure column UPDATE. A `set` for a sha256 with no blob row updates nothing and throws
 * nothing — the correct outcome, since there is no blob to describe.
 */
export class SqlMediaContentTypeStore implements MediaContentTypeStorePort {
  constructor(protected readonly kernel: ContentKernel) {}

  async getMany(required: { workspaceId: UUID; sha256s: readonly string[] }): Promise<Map<string, string>> {
    if (required.sha256s.length === 0) return new Map();
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("asset_blobs")
        .select(["sha256", "content_type"])
        .where("workspace_id", "=", required.workspaceId)
        .where("sha256", "in", [...required.sha256s])
        .execute()
    );

    const found = new Map<string, string>();
    for (const row of rows) {
      // A `null` column is "not sniffed yet" and must stay ABSENT from the map rather than become
      // a null entry — the port's `getMany` contract is what lets a caller tell that apart from a
      // recorded `application/octet-stream`.
      if (row.content_type != null) found.set(row.sha256, row.content_type);
    }
    return found;
  }

  async set(required: { workspaceId: UUID; sha256: string; contentType: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("asset_blobs")
        .set({ content_type: required.contentType })
        .where("workspace_id", "=", required.workspaceId)
        .where("sha256", "=", required.sha256)
        .execute()
    );
  }
}

function toAssetRenditionRecord(row: Selectable<AssetRenditionsTable>): AssetRenditionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    assetId: row.asset_id,
    transformName: row.transform_name,
    version: row.version,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  };
}

export class SqlAssetRenditionRepo implements AssetRenditionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByAsset(required: { workspaceId: UUID; assetId: UUID }): Promise<AssetRenditionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("asset_renditions").selectAll().where("workspace_id", "=", required.workspaceId).where("asset_id", "=", required.assetId).execute()
    );
    return rows.map(toAssetRenditionRecord);
  }

  async findOne(required: { workspaceId: UUID; assetId: UUID; transformName: string; version: number }): Promise<AssetRenditionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("asset_renditions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("asset_id", "=", required.assetId)
        .where("transform_name", "=", required.transformName)
        .where("version", "=", required.version)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toAssetRenditionRecord(row) : null;
  }

  /** Upsert by id: one statement, so there is no read-then-write window. */
  async save(record: AssetRenditionRecord): Promise<void> {
    const values: AssetRenditionsTable = {
      id: record.id,
      workspace_id: record.workspaceId,
      asset_id: record.assetId,
      transform_name: record.transformName,
      version: record.version,
      storage_key: record.storageKey,
      created_at: record.createdAt,
    };
    const { id: _id, ...updates } = values;
    await this.kernel.run((db) =>
      db
        .insertInto("asset_renditions")
        .values(values)
        .onConflict((oc) => oc.column("id").doUpdateSet(updates))
        .execute()
    );
  }

  async removeByAsset(required: { workspaceId: UUID; assetId: UUID }): Promise<void> {
    await this.kernel.run((db) =>
      db.deleteFrom("asset_renditions").where("workspace_id", "=", required.workspaceId).where("asset_id", "=", required.assetId).execute()
    );
  }
}

function toTransformDefinitionRecord(row: Selectable<TransformRegistryTable>): TransformDefinitionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    version: row.version,
    params: JSON.parse(row.params_json) as TransformParams,
    owner: row.owner,
    createdAt: row.created_at,
  };
}

export class SqlTransformDefinitionRepo implements TransformDefinitionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByName(required: { workspaceId: UUID; name: string }): Promise<TransformDefinitionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("transform_registry").selectAll().where("workspace_id", "=", required.workspaceId).where("name", "=", required.name).execute()
    );
    return rows.map(toTransformDefinitionRecord);
  }

  async findByNameVersion(required: { workspaceId: UUID; name: string; version: number }): Promise<TransformDefinitionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("transform_registry")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("name", "=", required.name)
        .where("version", "=", required.version)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toTransformDefinitionRecord(row) : null;
  }

  /** Append-only — the unique `(workspace_id, name, version)` index makes a duplicate insert
   * fail at the storage layer (a unique-constraint violation on any dialect), not just by convention. */
  async insert(record: TransformDefinitionRecord): Promise<void> {
    try {
      await this.kernel.run((db) =>
        db
          .insertInto("transform_registry")
          .values({
            id: record.id,
            workspace_id: record.workspaceId,
            name: record.name,
            version: record.version,
            params_json: JSON.stringify(record.params),
            owner: record.owner,
            created_at: record.createdAt,
          })
          .execute()
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new Error(
          `transform_registry row (workspace=${record.workspaceId}, name=${record.name}, v${record.version}) already exists — append-only violation`
        );
      }
      throw err;
    }
  }
}
