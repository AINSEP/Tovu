import type { UUID } from "@jini-ai/cms/core";
import type { MediaRecord, MediaRepoPort } from "@jini-ai/cms/media";

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

  constructor(initialRows: MediaRecord[] = []) {
    this.rows = [...initialRows];
  }

  async findById(required: { workspaceId: UUID; id: UUID }): Promise<MediaRecord | null> {
    return this.rows.find((row) => row.workspaceId === required.workspaceId && row.id === required.id) ?? null;
  }

  async findBySlug(required: { workspaceId: UUID; slug: string }): Promise<MediaRecord | null> {
    return this.rows.find((row) => row.workspaceId === required.workspaceId && row.slug === required.slug) ?? null;
  }

  async list(required: { workspaceId: UUID }): Promise<MediaRecord[]> {
    return this.rows.filter((row) => row.workspaceId === required.workspaceId);
  }

  async save(record: MediaRecord): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === record.id);
    if (index === -1) {
      this.rows.push(record);
      return;
    }
    this.rows[index] = record;
  }

  async remove(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.rows = this.rows.filter((row) => !(row.workspaceId === required.workspaceId && row.id === required.id));
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
    this.rows[index] = record;
    return { applied: true };
  }

  /** No `await` in this body — see {@link saveIfVersion}'s doc for why that is what makes it atomic. */
  async insertIfAbsent(record: MediaRecord): Promise<{ applied: boolean }> {
    if (this.rows.some((row) => row.id === record.id)) return { applied: false };
    this.rows.push(record);
    return { applied: true };
  }
}
