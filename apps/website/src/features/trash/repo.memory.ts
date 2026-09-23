/**
 * @file In-memory `TrashRepoPort` (rule-of-two adapter #1), mirroring the convention
 * `features/comments/repo.memory.ts` established: a real adapter used by tests, not a stub.
 *
 * Ordering, the lazy `purge_after` filter and the keyset cursor are implemented here the same way
 * the SQLite adapter implements them, and both share `cursor.ts`, so a test that passes against
 * this double is testing the behaviour the durable adapter has.
 */
import { decodeTrashCursor, encodeTrashCursor } from "./cursor.js";
import type { TrashEntityType, TrashItem, TrashPage, TrashRepoPort, TrashSweepClaim } from "./ports.js";

function identityKey(workspaceId: string, entityType: string, entityId: string): string {
  return `${workspaceId}\u0000${entityType}\u0000${entityId}`;
}

/** Newest first, `id` breaking ties so the keyset cursor is total. @complexity O(1). */
function compareDesc(a: TrashItem, b: TrashItem): number {
  if (a.trashedAt !== b.trashedAt) return a.trashedAt < b.trashedAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

export class InMemoryTrashRepo implements TrashRepoPort {
  private readonly rows = new Map<string, TrashItem>();
  private readonly leases = new Map<string, { owner: string; expiresAt: string }>();

  /** Test-only view of everything stored, including expired rows the list hides. */
  all(): TrashItem[] {
    return [...this.rows.values()].sort(compareDesc);
  }

  /** @complexity O(n) over stored rows (the identity scan); n is a test fixture. */
  async insert(row: TrashItem): Promise<void> {
    for (const existing of this.rows.values()) {
      if (identityKey(existing.workspaceId, existing.entityType, existing.entityId) ===
          identityKey(row.workspaceId, row.entityType, row.entityId)) {
        return; // INSERT OR IGNORE against `trashed_items_identity_unique`
      }
    }
    this.rows.set(row.id, { ...row });
  }

  async findByEntity(required: { workspaceId: string; entityType: TrashEntityType; entityId: string }): Promise<TrashItem | null> {
    const wanted = identityKey(required.workspaceId, required.entityType, required.entityId);
    for (const row of this.rows.values()) {
      if (identityKey(row.workspaceId, row.entityType, row.entityId) === wanted) return { ...row };
    }
    return null;
  }

  async findByIds(required: { workspaceId: string; ids: readonly string[] }): Promise<TrashItem[]> {
    return required.ids
      .map((id) => this.rows.get(id))
      .filter((row): row is TrashItem => row !== undefined && row.workspaceId === required.workspaceId)
      .map((row) => ({ ...row }));
  }

  async deleteById(required: { workspaceId: string; id: string }): Promise<void> {
    const row = this.rows.get(required.id);
    if (row && row.workspaceId === required.workspaceId) {
      this.rows.delete(required.id);
      this.leases.delete(required.id);
    }
  }

  async deleteByEntity(required: { workspaceId: string; entityType: TrashEntityType; entityId: string }): Promise<void> {
    const found = await this.findByEntity(required);
    if (found) {
      this.rows.delete(found.id);
      this.leases.delete(found.id);
    }
  }

  /** @complexity O(n log n) — sorts the workspace's rows; fixture-sized by construction. */
  async list(required: {
    workspaceId: string;
    now: string;
    entityTypes?: readonly TrashEntityType[];
    limit: number;
    cursor?: string | null;
  }): Promise<TrashPage> {
    const after = decodeTrashCursor(required.cursor);
    const types = required.entityTypes && required.entityTypes.length > 0 ? new Set(required.entityTypes) : null;

    const matched = [...this.rows.values()]
      .filter((row) => row.workspaceId === required.workspaceId)
      // The lazy filter: expired rows vanish from the list the instant it opens, whether or not a
      // sweeper has ever run on this machine.
      .filter((row) => row.purgeAfter > required.now)
      .filter((row) => (types ? types.has(row.entityType) : true))
      .sort(compareDesc)
      .filter((row) => {
        if (!after) return true;
        if (row.trashedAt !== after.trashedAt) return row.trashedAt < after.trashedAt;
        return row.id < after.id;
      });

    const items = matched.slice(0, required.limit).map((row) => ({ ...row }));
    const last = items.at(-1);
    const nextCursor = matched.length > required.limit && last ? encodeTrashCursor(last) : null;
    return { items, nextCursor };
  }

  /** @complexity O(n log n). */
  async claimDue(required: { now: string; leaseOwner: string; leaseUntil: string; limit: number }): Promise<TrashSweepClaim[]> {
    const due = [...this.rows.values()]
      .filter((row) => row.purgeAfter <= required.now)
      .filter((row) => {
        const lease = this.leases.get(row.id);
        return !lease || lease.expiresAt <= required.now;
      })
      .sort((a, b) => (a.purgeAfter < b.purgeAfter ? -1 : a.purgeAfter > b.purgeAfter ? 1 : 0))
      .slice(0, required.limit);

    for (const row of due) {
      this.leases.set(row.id, { owner: required.leaseOwner, expiresAt: required.leaseUntil });
    }

    return due.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      entityType: row.entityType,
      entityId: row.entityId,
      entityVersion: row.entityVersion,
    }));
  }

  async releaseLease(required: { id: string }): Promise<void> {
    this.leases.delete(required.id);
  }
}
