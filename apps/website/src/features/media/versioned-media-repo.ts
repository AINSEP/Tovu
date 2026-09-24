import type { UUID } from "@jini-ai/cms/core";
import { MediaConflictError, type MediaRecord, type MediaRepoPort } from "@jini-ai/cms/media";

/**
 * @file `MediaRepoPort` extended with an atomic compare-and-set write, and the in-memory adapter
 * that implements it — following the one-file port-plus-adapter precedent of
 * `content-type-store.ts`.
 *
 * ## Why this lives here and not in Jini
 *
 * `import-media-entity.ts`'s own header already discloses the limitation this file fixes: "The
 * optimistic-concurrency guard here is check-then-write, not atomic. `MediaRepoPort` has no
 * `saveIfVersion`." The version compare (`publish-content.ts`'s Guard 1) and the eventual write
 * (`importMediaEntity`'s `mediaRepo.save`) are separate statements with several real `await`s
 * between them — blob-store I/O on `LocalFsBlobStore` — so two concurrent importers can both pass
 * the compare and both land a write; whichever writes last wins silently, and the other operator's
 * change is gone with no error.
 *
 * `MediaRepoPort` itself lives in `@jini-ai/cms` (a separate package/repo). Widening it there would
 * mean a Jini build, dist rebuild and publish cycle for a fix that only this host's production
 * adapter (`platform/db/sqlite/media-repo.sqlite.ts`) needs today — the same call this codebase
 * already made for `PostRepoPort.saveIfVersion` staying Tovu-local until Jini needs it too (see
 * `features/post/post.ts`). `VersionedMediaRepoPort` is therefore a Tovu-local, additive extension
 * of the upstream port: any `MediaRepoPort` implementation still satisfies every existing caller,
 * and only the publish-import path (which is being fixed here) requires the wider one.
 *
 * Imports types directly from `@jini-ai/cms/media` rather than this directory's own `./index.js`
 * barrel, so the barrel re-exporting THIS file (see `index.ts`) never becomes a cycle.
 */

/** `MediaRepoPort` plus an atomic compare-and-set write and a create-only insert — the two
 *  primitives `importMediaEntity` needs to make the publish-apply write race-proof. Mirrors
 *  `PostRepoPort.saveIfVersion`'s contract exactly (see `features/post/post.ts`'s doc for the full
 *  "why a separate method, not a predicate on `save`" reasoning — the same gap applies here:
 *  `importMediaEntity` compares a caller-supplied `baseVersion` against a row read several awaits
 *  earlier, with real blob-store I/O in between). */
export interface VersionedMediaRepoPort extends MediaRepoPort {
  /**
   * Compare-and-set: writes `record` over the existing row ONLY while it is still at `ifVersion`
   * (workspace + id + version compared and written in ONE atomic step — never a separate
   * `findById()` read followed by a separate `save()` write, since that pair is exactly the race
   * this method exists to close).
   *
   * @returns `{ applied: true }` when the row was at `ifVersion` and now holds `record`;
   * `{ applied: false }` when the row was missing or at a different version — nothing was written.
   */
  saveIfVersion(required: { record: MediaRecord; ifVersion: number }): Promise<{ applied: boolean }>;
  /**
   * Create-only write: inserts `record` iff no row currently holds `record.id` (the primary key is
   * global, not per-workspace — mirrors `MediaRepoPort.save`'s own id-only lookup).
   *
   * @returns `{ applied: true }` when this call created the row; `{ applied: false }` when the id
   * was already taken — nothing was written. A slug collision is a different refusal and still
   * throws `MediaConflictError`, the same as `save`.
   */
  insertIfAbsent(record: MediaRecord): Promise<{ applied: boolean }>;
  /**
   * Every slug `mediaId` has ever retired (readable-slugs plan, S2a): a slug it once held and then
   * renamed away from. `save`/`saveIfVersion`/`insertIfAbsent` all move an asset's PRIOR slug in
   * here the moment a rename lands, and `findBySlug` falls back to this list — so a `/m/<old-
   * slug>/...` URL already baked into rendered HTML, a cached `og:image`, or a hand-typed marker
   * keeps resolving forever, and a different asset can never claim a name still listed here (see
   * `MediaConflictError` on the write methods above). `remove()` drops an asset's rows here too,
   * which is what frees a retired name back up.
   *
   * @returns retired slugs in no particular order; empty when `mediaId` has never renamed.
   */
  listRetiredSlugs(required: { workspaceId: UUID; mediaId: UUID }): Promise<string[]>;
}

/**
 * In-memory `VersionedMediaRepoPort` adapter — the ADR-006 rule-of-two test double for the
 * publish-import path's atomic writes. Copies `@jini-ai/cms/media`'s `InMemoryMediaRepo` exactly
 * (same constructor, same `findById`/`findBySlug`/`list` shape, same `save` keyed on id alone) and
 * adds the two compare-and-set primitives. Neither new method enforces slug uniqueness, for parity
 * with the upstream in-memory adapter — the contract suite's slug-collision tests are `[sqlite]`-only.
 */
export class InMemoryVersionedMediaRepo implements VersionedMediaRepoPort {
  private rows: MediaRecord[];
  /** One row per retired slug (readable-slugs plan, S2a) — see {@link VersionedMediaRepoPort.listRetiredSlugs}'s
   *  own doc. Mirrors `SqliteMediaRepo`'s `media_slug_history` table shape exactly (same
   *  `(workspaceId, slug)` uniqueness the real UNIQUE index enforces on the sqlite adapter — kept
   *  here as a runtime invariant of {@link retireSlug}/{@link reclaimOwnSlug} rather than a schema
   *  constraint, since this adapter has none). */
  private retired: Array<{ workspaceId: UUID; slug: string; mediaId: UUID; retiredAt: string }>;

  constructor(initialRows: MediaRecord[] = []) {
    this.rows = [...initialRows];
    this.retired = [];
  }

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<MediaRecord | null> {
    return this.rows.find((row) => row.workspaceId === required.workspaceId && row.id === required.id) ?? null;
  }

  /** Falls back to {@link retired} when no LIVE row currently holds `slug` — see this class's file
   *  header for why a retired slug must keep resolving. */
  async findBySlug(required: { workspaceId: UUID; slug: string }): Promise<MediaRecord | null> {
    const live = this.rows.find((row) => row.workspaceId === required.workspaceId && row.slug === required.slug);
    if (live) return live;
    const retired = this.retired.find((row) => row.workspaceId === required.workspaceId && row.slug === required.slug);
    if (!retired) return null;
    return this.rows.find((row) => row.workspaceId === required.workspaceId && row.id === retired.mediaId) ?? null;
  }

  async list(required: { workspaceId: UUID }): Promise<MediaRecord[]> {
    return this.rows.filter((row) => row.workspaceId === required.workspaceId);
  }

  /** Reclaiming its own old slug removes it from {@link retired} (S2a: "an asset may take back its
   *  own old slug"). A DIFFERENT asset's claim on a slug still in {@link retired} throws
   *  `MediaConflictError`, same as a live-row collision. */
  private reclaimOwnSlug(workspaceId: UUID, mediaId: UUID, slug: string): void {
    const claimant = this.retired.find((row) => row.workspaceId === workspaceId && row.slug === slug);
    if (!claimant) return;
    if (claimant.mediaId !== mediaId) {
      throw new MediaConflictError(`slug '${slug}' is already used by another media asset in this workspace`);
    }
    this.retired = this.retired.filter((row) => row !== claimant);
  }

  /** Moves `oldSlug` into {@link retired} for `mediaId`, unless the rename is a no-op or there was
   *  no prior slug (a brand-new row). */
  private retireSlug(workspaceId: UUID, mediaId: UUID, oldSlug: string | null | undefined, newSlug: string, retiredAt: string): void {
    if (!oldSlug || oldSlug === newSlug) return;
    this.retired.push({ workspaceId, slug: oldSlug, mediaId, retiredAt });
  }

  async save(record: MediaRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    this.reclaimOwnSlug(record.workspaceId, record.id, record.slug);
    const priorSlug = index === -1 ? null : this.rows[index].slug;
    if (index === -1) {
      this.rows.push(record);
    } else {
      this.rows[index] = record;
    }
    this.retireSlug(record.workspaceId, record.id, priorSlug, record.slug, record.updatedAt);
  }

  async remove(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.rows = this.rows.filter((row) => !(row.workspaceId === required.workspaceId && row.id === required.id));
    this.retired = this.retired.filter((row) => !(row.workspaceId === required.workspaceId && row.mediaId === required.id));
  }

  async listRetiredSlugs(required: { workspaceId: UUID; mediaId: UUID }): Promise<string[]> {
    return this.retired
      .filter((row) => row.workspaceId === required.workspaceId && row.mediaId === required.mediaId)
      .map((row) => row.slug);
  }

  /**
   * No `await` anywhere in this body — that is what makes it atomic with respect to any other
   * caller of this same in-process adapter: JS never preempts a synchronous run between the
   * `findIndex` compare and the write, so no other call can interleave between them the way two
   * separate `findById()`/`save()` calls could.
   *
   * @complexity O(n) in this workspace's row count — a linear scan, the same cost `findById` already
   * pays for this adapter.
   */
  async saveIfVersion(required: { record: MediaRecord; ifVersion: number }): Promise<{ applied: boolean }> {
    const { record, ifVersion } = required;
    const index = this.rows.findIndex((row) => row.workspaceId === record.workspaceId && row.id === record.id);
    if (index === -1 || this.rows[index].version !== ifVersion) return { applied: false };
    this.reclaimOwnSlug(record.workspaceId, record.id, record.slug);
    const priorSlug = this.rows[index].slug;
    this.rows[index] = record;
    this.retireSlug(record.workspaceId, record.id, priorSlug, record.slug, record.updatedAt);
    return { applied: true };
  }

  /** No `await` in this body — see {@link saveIfVersion}'s doc for why that is what makes it atomic. */
  async insertIfAbsent(record: MediaRecord): Promise<{ applied: boolean }> {
    if (this.rows.some((row) => row.id === record.id)) return { applied: false };
    this.reclaimOwnSlug(record.workspaceId, record.id, record.slug);
    this.rows.push(record);
    return { applied: true };
  }
}
