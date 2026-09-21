import { EntrySlugConflictError, InMemoryEntryRepo } from "./index.js";
import type { EntryListPort, EntryRecord, EntryRepoPort, EntryRevisionInput, EntryStatus } from "./index.js";

/**
 * @file The in-memory twin of `repo.sqlite.ts`'s Trash rules, for the hermetic composition
 * (`server/runtime/composition/app.ts`), which has no `content.db`. Wraps the package's
 * `InMemoryEntryRepo` and keeps each trashed row's `deletedAt` beside it:
 *  - every read hides a trashed row;
 *  - `save` leaves a trashed row as it is, and refuses a slug a trashed row holds;
 *  - `findAnyById`/`saveAny` are the trash-blind seam the Trash's record-store adapter flips the
 *    marker through (the SQLite root flips `entries.deleted_at` with the generic table adapter).
 */

/** An entry plus its Trash marker, as the Trash's record-store adapter sees it. */
export type TrashableEntryRecord = EntryRecord & { deletedAt: string | null };

export class TrashAwareInMemoryEntryRepo implements EntryRepoPort, EntryListPort {
  private readonly inner = new InMemoryEntryRepo();
  /** id → when it was trashed. */
  private readonly deletedAt = new Map<string, string>();

  /** @complexity O(n) over stored entries (the inner repo's scan). */
  async findBySlug(params: { workspaceId: string; type: string; slug: string }): Promise<EntryRecord | null> {
    const row = await this.inner.findBySlug(params);
    return row && !this.deletedAt.has(row.id) ? row : null;
  }

  /** @complexity O(1). */
  async findById(params: { workspaceId: string; id: string }): Promise<EntryRecord | null> {
    const row = await this.inner.findById(params);
    return row && !this.deletedAt.has(row.id) ? row : null;
  }

  /**
   * @throws EntrySlugConflictError when a trashed row holds the slug (same text as the SQLite repo).
   * @complexity O(n) over stored entries (one slug scan).
   */
  async save(row: EntryRecord): Promise<void> {
    if (this.deletedAt.has(row.id)) return;
    const holder = await this.inner.findBySlug({ workspaceId: row.workspaceId, type: row.type, slug: row.slug });
    if (holder && holder.id !== row.id && this.deletedAt.has(holder.id)) {
      throw new EntrySlugConflictError(
        `an entry with slug '${row.slug}' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug`
      );
    }
    await this.inner.save(row);
  }

  async appendRevision(revision: EntryRevisionInput): Promise<void> {
    await this.inner.appendRevision(revision);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.inner.transaction(fn);
  }

  /** `limit` applies after trashed rows are dropped, as the SQLite `LIMIT` does.
   *  @complexity O(n log n) over the workspace's entries when ordered. */
  async listByWorkspace(params: {
    workspaceId: string;
    type?: string;
    status?: EntryStatus;
    orderBy?: "updatedAt";
    orderDirection?: "asc" | "desc";
    limit?: number;
  }): Promise<EntryRecord[]> {
    const { limit, ...rest } = params;
    const live = (await this.inner.listByWorkspace(rest)).filter((row) => !this.deletedAt.has(row.id));
    return typeof limit === "number" ? live.slice(0, limit) : live;
  }

  /** Trash seam: the row whether or not it is trashed. @complexity O(1). */
  async findAnyById(params: { workspaceId: string; id: string }): Promise<TrashableEntryRecord | null> {
    const row = await this.inner.findById(params);
    return row ? { ...row, deletedAt: this.deletedAt.get(row.id) ?? null } : null;
  }

  /** Trash seam: writes the row and its marker as given. @complexity O(1). */
  async saveAny(record: TrashableEntryRecord): Promise<void> {
    const { deletedAt, ...row } = record;
    await this.inner.save(row);
    if (deletedAt === null) this.deletedAt.delete(row.id);
    else this.deletedAt.set(row.id, deletedAt);
  }
}
