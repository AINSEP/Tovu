/**
 * @file SQLite `TrashRepoPort` adapter (rule-of-two adapter #2) over `trashed_items`
 * (migration `0070_trashed_items.sql`).
 *
 * Takes the raw `better-sqlite3` handle rather than the Drizzle wrapper, for two reasons that are
 * both about correctness rather than taste: `INSERT OR IGNORE` against
 * `trashed_items_identity_unique` has no Drizzle builder here, and `claimDue` needs its
 * SELECT-then-UPDATE pair to run as one atomic unit — Drizzle's `transaction()` wrapper requires a
 * synchronous callback, which is exactly what these statements are.
 *
 * Every statement in this file is column-only. Nothing here reads a domain table, which is what
 * keeps the Trash list working on rows whose payload is corrupt.
 */
import type Database from "better-sqlite3";

import { decodeTrashCursor, encodeTrashCursor } from "./cursor.js";
import type { TrashEntityType, TrashItem, TrashPage, TrashRepoPort, TrashSweepClaim } from "./ports.js";

interface TrashRow {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  trashed_at: string;
  purge_after: string;
  actor_principal_id: string;
  actor_plugin_id: string | null;
  display_title: string;
  display_subtitle: string | null;
  entity_version: number | null;
}

/** @complexity O(1). */
function toItem(row: TrashRow): TrashItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    trashedAt: row.trashed_at,
    purgeAfter: row.purge_after,
    actorPrincipalId: row.actor_principal_id,
    actorPluginId: row.actor_plugin_id,
    displayTitle: row.display_title,
    displaySubtitle: row.display_subtitle,
    entityVersion: row.entity_version,
  };
}

const SELECT_COLUMNS =
  "id, workspace_id, entity_type, entity_id, trashed_at, purge_after, actor_principal_id, actor_plugin_id, display_title, display_subtitle, entity_version";

export class SqliteTrashRepo implements TrashRepoPort {
  constructor(private readonly client: Database.Database) {}

  /**
   * `INSERT OR IGNORE` — re-trashing an already-trashed entity is a no-op, not a duplicate row and
   * not an error, because a domain's own delete path may be idempotent (media's is).
   *
   * @complexity O(1), one indexed insert.
   */
  async insert(row: TrashItem): Promise<void> {
    this.client
      .prepare(
        `INSERT OR IGNORE INTO trashed_items
           (id, workspace_id, entity_type, entity_id, trashed_at, purge_after,
            actor_principal_id, actor_plugin_id, display_title, display_subtitle, entity_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.workspaceId,
        row.entityType,
        row.entityId,
        row.trashedAt,
        row.purgeAfter,
        row.actorPrincipalId,
        row.actorPluginId,
        row.displayTitle,
        row.displaySubtitle,
        row.entityVersion
      );
  }

  /** @complexity O(1) via `trashed_items_identity_unique`. */
  async findByEntity(required: { workspaceId: string; entityType: TrashEntityType; entityId: string }): Promise<TrashItem | null> {
    const row = this.client
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM trashed_items
          WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?`
      )
      .get(required.workspaceId, required.entityType, required.entityId) as TrashRow | undefined;
    return row ? toItem(row) : null;
  }

  /** @complexity O(k) primary-key lookups for k ids — parameterised, never interpolated. */
  async findByIds(required: { workspaceId: string; ids: readonly string[] }): Promise<TrashItem[]> {
    if (required.ids.length === 0) return [];
    const placeholders = required.ids.map(() => "?").join(", ");
    const rows = this.client
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM trashed_items
          WHERE workspace_id = ? AND id IN (${placeholders})`
      )
      .all(required.workspaceId, ...required.ids) as TrashRow[];
    return rows.map(toItem);
  }

  async deleteById(required: { workspaceId: string; id: string }): Promise<void> {
    this.client.prepare(`DELETE FROM trashed_items WHERE workspace_id = ? AND id = ?`).run(required.workspaceId, required.id);
  }

  async deleteByEntity(required: { workspaceId: string; entityType: TrashEntityType; entityId: string }): Promise<void> {
    this.client
      .prepare(`DELETE FROM trashed_items WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?`)
      .run(required.workspaceId, required.entityType, required.entityId);
  }

  /**
   * The Trash list: newest first, keyset-paginated on `(trashed_at, id)`, with the lazy expiry
   * filter (`purge_after > now`) so a site that sat closed past day 60 shows nothing expired on its
   * first render — no wait for a sweeper that may not have run on this machine in months.
   *
   * Fetches `limit + 1` to decide `nextCursor` without a second COUNT query.
   *
   * @complexity O(limit) via `idx_trashed_items_workspace_trashed_at`.
   */
  async list(required: {
    workspaceId: string;
    now: string;
    entityTypes?: readonly TrashEntityType[];
    limit: number;
    cursor?: string | null;
  }): Promise<TrashPage> {
    const after = decodeTrashCursor(required.cursor);
    const params: unknown[] = [required.workspaceId, required.now];
    let where = `workspace_id = ? AND purge_after > ?`;

    if (required.entityTypes && required.entityTypes.length > 0) {
      where += ` AND entity_type IN (${required.entityTypes.map(() => "?").join(", ")})`;
      params.push(...required.entityTypes);
    }
    if (after) {
      where += ` AND (trashed_at < ? OR (trashed_at = ? AND id < ?))`;
      params.push(after.trashedAt, after.trashedAt, after.id);
    }

    const rows = this.client
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM trashed_items
          WHERE ${where}
          ORDER BY trashed_at DESC, id DESC
          LIMIT ?`
      )
      .all(...params, required.limit + 1) as TrashRow[];

    const items = rows.slice(0, required.limit).map(toItem);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > required.limit && last ? encodeTrashCursor(last) : null };
  }

  /**
   * Atomically claims up to `limit` due, unleased rows across EVERY workspace in the file — the
   * `idx_trashed_items_purge_after` index is deliberately global for exactly this query.
   *
   * SELECT-then-UPDATE inside one transaction rather than `UPDATE … LIMIT`, which needs a SQLite
   * compile-time flag that is not guaranteed and does not port to Postgres. An expired lease is
   * reclaimable, which is what gives the sweeper crash recovery for free.
   *
   * @complexity O(limit) via the `purge_after` index.
   */
  async claimDue(required: { now: string; leaseOwner: string; leaseUntil: string; limit: number }): Promise<TrashSweepClaim[]> {
    const claim = this.client.transaction((): TrashSweepClaim[] => {
      const due = this.client
        .prepare(
          `SELECT id, workspace_id, entity_type, entity_id, entity_version
             FROM trashed_items
            WHERE purge_after <= ?
              AND (purge_lease_expires_at IS NULL OR purge_lease_expires_at <= ?)
            ORDER BY purge_after
            LIMIT ?`
        )
        .all(required.now, required.now, required.limit) as {
        id: string;
        workspace_id: string;
        entity_type: string;
        entity_id: string;
        entity_version: number | null;
      }[];

      if (due.length === 0) return [];

      const placeholders = due.map(() => "?").join(", ");
      this.client
        .prepare(
          `UPDATE trashed_items
              SET purge_lease_owner = ?, purge_lease_expires_at = ?
            WHERE id IN (${placeholders})`
        )
        .run(required.leaseOwner, required.leaseUntil, ...due.map((row) => row.id));

      return due.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityVersion: row.entity_version,
      }));
    });
    return claim();
  }

  /** @complexity O(1). */
  async releaseLease(required: { id: string }): Promise<void> {
    this.client
      .prepare(`UPDATE trashed_items SET purge_lease_owner = NULL, purge_lease_expires_at = NULL WHERE id = ?`)
      .run(required.id);
  }
}

/**
 * A reentrant {@link import("./ports.js").TransactionRunner} over one better-sqlite3 connection.
 *
 * Checks `client.inTransaction` and passes straight through when one is already open. Posts and
 * redirects both open their own `BEGIN IMMEDIATE` around "marker write + revision-ledger append",
 * and `deps.remove` is called from inside it — a nested `BEGIN IMMEDIATE` would throw. Passing
 * through preserves both-or-neither exactly: a throw inside propagates to the outer `ROLLBACK`.
 *
 * @complexity O(1) beyond `fn`.
 */
export function createContentDbTransactionRunner(client: Database.Database) {
  return async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (client.inTransaction) return fn();
    client.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      client.exec("COMMIT");
      return result;
    } catch (error) {
      client.exec("ROLLBACK");
      throw error;
    }
  };
}
