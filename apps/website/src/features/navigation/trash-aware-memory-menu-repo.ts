import { InMemoryMenuRepo, MenuConflictError } from "@jini-ai/cms/navigation";
import type { MenuRepoPort, MenuStatus, NavMenuEntry } from "@jini-ai/cms/navigation";

import type { MenuTrashLookup } from "./menu-trash-follow-ups.js";

/**
 * @file The in-memory twin of `repo.sqlite.ts`'s Trash rules, for the hermetic composition
 * (`server/runtime/composition/app.ts`), which has no `content.db`. Wraps Jini's `InMemoryMenuRepo`
 * (precedent: `features/entries/trash-aware-memory-repo.ts`).
 *
 * Unlike entries, `NavMenuEntry.status` already natively supports `"trash"` as a real `MenuStatus`
 * value, so no separate `deletedAt` side-map is needed to detect hidden state — `status === "trash"`
 * is enough. What IS needed is a side-map for the **prior** status (what to restore to): once
 * `status` flips to `"trash"`, the record itself no longer remembers what it was before.
 */

/** A menu plus the status it held before being trashed, as the Trash's record-store adapter sees it. */
export type TrashableMenuRecord = NavMenuEntry & { priorStatus: MenuStatus | null };

export class TrashAwareInMemoryMenuRepo implements MenuRepoPort, MenuTrashLookup {
  private readonly inner = new InMemoryMenuRepo();
  /** id → status held immediately before the most recent trash. */
  private readonly priorStatus = new Map<string, MenuStatus>();

  /** @complexity O(n) over stored menus (the inner repo's scan). */
  async findById(required: { workspaceId: string; id: string }): Promise<NavMenuEntry | null> {
    const row = await this.inner.findById(required);
    return row && row.status !== "trash" ? row : null;
  }

  /** @complexity O(n) over stored menus. */
  async findBySlug(required: { workspaceId: string; slug: string }): Promise<NavMenuEntry | null> {
    const row = await this.inner.findBySlug(required);
    return row && row.status !== "trash" ? row : null;
  }

  /** @complexity O(n) over stored menus. */
  async list(required: { workspaceId: string }): Promise<NavMenuEntry[]> {
    const rows = await this.inner.list(required);
    return rows.filter((row) => row.status !== "trash");
  }

  /** Trash-blind twin of `findById` — sees a trashed row too. @complexity O(n). */
  async findByIdIncludingTrashed(required: { workspaceId: string; id: string }): Promise<NavMenuEntry | null> {
    return this.inner.findById(required);
  }

  /**
   * A trashed row is left as it is — mirrors `SqliteMenuRepo.save`'s `setWhere: NOT_TRASHED`
   * no-op. `InMemoryMenuRepo.save` does a full-replace `Map`-style write (verified by reading
   * `repo.memory.ts`), so writing through it never silently drops `doc`/`locations`.
   * @throws MenuConflictError when a trashed row holds the slug (same text as the SQLite repo).
   * @complexity O(n) over stored menus (one id lookup, one slug scan).
   */
  async save(record: NavMenuEntry): Promise<void> {
    const existing = await this.inner.findById({ workspaceId: record.workspaceId, id: record.id });
    if (existing && existing.status === "trash") return;

    const holder = await this.inner.findBySlug({ workspaceId: record.workspaceId, slug: record.slug });
    if (holder && holder.id !== record.id && holder.status === "trash") {
      throw new MenuConflictError(
        `a menu with slug '${record.slug}' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug`
      );
    }
    await this.inner.save(record);
  }

  /** Hard-remove a menu row (only called after the trash step). @complexity O(n). */
  async remove(required: { workspaceId: string; id: string }): Promise<void> {
    await this.inner.remove(required);
  }

  /** Trash seam: the row whether or not it is trashed, plus its restore marker. @complexity O(n). */
  async findAnyById(required: { workspaceId: string; id: string }): Promise<TrashableMenuRecord | null> {
    const row = await this.inner.findById(required);
    return row ? { ...row, priorStatus: this.priorStatus.get(row.id) ?? null } : null;
  }

  /** Trash seam: writes the row and updates the prior-status marker as given. @complexity O(n). */
  async saveAny(record: TrashableMenuRecord): Promise<void> {
    const { priorStatus, ...row } = record;
    await this.inner.save(row);
    if (priorStatus === null) this.priorStatus.delete(row.id);
    else this.priorStatus.set(row.id, priorStatus);
  }
}
