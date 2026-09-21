/**
 * @file `createTableTrashAdapter` — the ONE `TrashAdapter` implementation for every `TRASHABLE` entry
 * (`registry.ts`), written once against the dialect-neutral `TrashDb` port (`db-port.ts`) instead of
 * once per domain. Design of record: `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md`
 * §1. Supersedes the prior `t8f-trash-g1` handoff's sketch on one point: this file implements the
 * `"status"` marker kind fully, rather than throwing for it — the G1b dispatch asks for a tested
 * status-marker case, so there is no untested branch left to guard against with a thrown error.
 *
 * Reproduces the bespoke `flipMarker`/`compareAndDelete` pair's (`adapters/marker-sql.ts`) exact
 * contract, generically:
 *  - `hide`/`unhide` read the row FIRST, then classify not-found / version-changed / already-in-state
 *    / real transition, in that order — matching `flipMarker`'s precedence (a version mismatch always
 *    wins over "it's already in the target state"). The read-then-write here is exactly as atomic as
 *    `flipMarker`'s single compound `UPDATE ... WHERE`: `TrashDb.transaction` always runs inside a
 *    `BEGIN IMMEDIATE` (`db-port.sqlite.ts`), which takes SQLite's write lock immediately, so no other
 *    writer can interleave between the read and the write.
 *  - `purge` never deletes a LIVE row or its `purgeFirst` children, even at a matching version
 *    (decision 6) — checked before either delete runs, same order as `adapters/form.ts`'s bespoke
 *    purge.
 *
 * The one piece `db-port.ts`'s dialect-neutral shape does not give for free: Drizzle's
 * `.update(table).set(...)` wants its `SET` object keyed by the table's JS PROPERTY names
 * (`{ deletedAt: ... }`, see `forms/repo.sqlite.ts:182`), not by SQL column name and not by the column
 * object itself. `TrashEntry` only carries column OBJECTS (so `registry.ts` stays free of any
 * per-field string duplication), so this file resolves each writable column's property key ONCE at
 * adapter construction, via Drizzle's own `getTableColumns(table)` — the same map Drizzle keys by
 * property name internally — rather than adding a second, hand-maintained string field per column to
 * `TrashEntry`.
 */
import { and, eq, getTableColumns, getTableName, sql, type AnyColumn, type SQL, type Table } from "drizzle-orm";

import type { TrashDb, TrashDbAssignment } from "./db-port.js";
import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "./ports.js";
import type { TrashEntry, TrashMarkerSpec } from "./registry.js";

/** The row shape every `hide`/`unhide`/`purge` read needs: the marker's raw value, plus the version
 *  column when the entry has one. Cast once, right after the read — `TrashDb.selectOne`'s generic
 *  selection type loses its literal keys once `columns` is built as a plain `Record<string,
 *  AnyColumn>` (needed here because the key set is conditional on `entry.versionColumn`), so the
 *  precise row shape is asserted here instead. Safe: every column reaching this file comes from a
 *  `TrashEntry` built off `schema.ts`, so the runtime row always has these keys. */
interface MarkerRow {
  marker: unknown;
  version?: number | null;
}

/**
 * Resolves a column object to the JS property name Drizzle's `.set()` needs to write it — see the
 * file header. Runs once per entry at adapter construction, never per call.
 *
 * @throws if `column` is not actually one of `table`'s own columns — a `TrashEntry` registration bug
 *         (a column from the wrong table), not a runtime condition to degrade around.
 * @complexity O(c) in the table's column count, once per entry.
 */
function resolveColumnKey(table: Table, column: AnyColumn): string {
  const columns = getTableColumns(table);
  for (const [key, value] of Object.entries(columns)) {
    if (value === column) return key;
  }
  throw new Error(
    `trash: column '${column.name}' is not a column of table '${getTableName(table)}' — check this TrashEntry's registration in registry.ts.`
  );
}

/**
 * Whether a marker's raw column VALUE (already read from a row) currently means "live". The scalar
 * twin of `not-trashed.ts`'s SQL-condition builders (`notTrashed`/`isCurrentlyTrashed`) — this file
 * always has the value in hand from a prior `selectOne`, not a `WHERE` clause left to build.
 *
 * @complexity O(1).
 */
function isMarkerValueLive(marker: TrashMarkerSpec, value: unknown): boolean {
  return marker.kind === "timestamp" ? value === null : value !== marker.trashed;
}

/**
 * Builds one `TrashAdapter` for a single {@link TrashEntry}. Registered once per entry into the
 * adapter map at composition (`deps.ts`), exactly like every bespoke adapter today.
 *
 * @complexity O(c) to construct (resolving up to three column keys); each method is O(1) plus
 *             whatever index its `where` matches, same complexity class as the bespoke adapters.
 */
export function createTableTrashAdapter(required: { entry: TrashEntry; db: TrashDb }): TrashAdapter {
  const { entry, db } = required;
  const markerKey = resolveColumnKey(entry.table, entry.marker.column);
  const versionKey = entry.versionColumn ? resolveColumnKey(entry.table, entry.versionColumn) : undefined;
  const touchKey = entry.touchColumn ? resolveColumnKey(entry.table, entry.touchColumn) : undefined;

  /** `workspace_id = ? AND id = ?`, plus the entry's fixed `scope` predicate when it has one. Always
   *  at least two conditions, so `and(...)` never returns `undefined`. */
  function baseWhere(workspaceId: string, entityId: string): SQL {
    const conditions: SQL[] = [eq(entry.workspaceColumn, workspaceId), eq(entry.idColumn, entityId)];
    if (entry.scope) conditions.push(entry.scope);
    return and(...conditions)!;
  }

  /** @complexity O(1) plus whatever index `baseWhere` matches. */
  async function readMarkerRow(workspaceId: string, entityId: string): Promise<MarkerRow | null> {
    const columns: Record<string, AnyColumn> = { marker: entry.marker.column };
    if (entry.versionColumn) columns.version = entry.versionColumn;
    return (await db.selectOne({ table: entry.table, columns, where: baseWhere(workspaceId, entityId) })) as MarkerRow | null;
  }

  /** Re-reads the version after a write — never chained off the write itself (no `RETURNING`, see
   *  `db-port.ts`'s file header). `null` for an entry with no version column.
   *  @complexity O(1) plus whatever index `baseWhere` matches. */
  async function readVersion(workspaceId: string, entityId: string): Promise<number | null> {
    if (!entry.versionColumn) return null;
    const row = (await db.selectOne({
      table: entry.table,
      columns: { version: entry.versionColumn },
      where: baseWhere(workspaceId, entityId),
    })) as { version: number } | null;
    return row?.version ?? null;
  }

  return {
    entityType: entry.entityType,

    /**
     * Move the entry's marker to hidden. Classification order (matches `flipMarker`):
     * not-found -> version-changed -> already-in-state (idempotent, no write) -> real transition.
     *
     * @complexity O(1): one read, at most one write, at most one re-read — all inside the caller's
     *             transaction (reentrant, see `db-port.sqlite.ts`).
     */
    async hide(hideRequired): Promise<TrashMarkerResult> {
      return db.transaction({
        run: async () => {
          const { workspaceId, entityId, at, expectedVersion } = hideRequired;
          const before = await readMarkerRow(workspaceId, entityId);
          if (!before) return { ok: false, reason: "not-found" };
          if (entry.versionColumn && expectedVersion !== null && before.version !== expectedVersion) {
            return { ok: false, reason: "version-changed" };
          }
          if (!isMarkerValueLive(entry.marker, before.marker)) {
            // Already trashed -- idempotent success, no write (mirrors `flipMarker`'s fallback branch).
            return { ok: true, version: entry.versionColumn ? (before.version ?? null) : null };
          }

          const set: TrashDbAssignment = { [markerKey]: entry.marker.kind === "timestamp" ? at : entry.marker.trashed };
          if (touchKey) set[touchKey] = at;
          if (versionKey && entry.versionColumn) set[versionKey] = sql`${entry.versionColumn} + 1`;
          await db.updateWhere({ table: entry.table, set, where: baseWhere(workspaceId, entityId) });

          const version = await readVersion(workspaceId, entityId);
          // `priorMarker` is additive (migration 0072) and only meaningful for a status marker's
          // real transition — a timestamp marker has no "previous value" to remember, and the
          // idempotent branch above never reaches here. Omitting the key (not setting it to
          // `undefined`) keeps a timestamp entry's result shape byte-identical to the bespoke
          // adapters' `{ ok: true, version }` (`ports.ts`'s `TrashMarkerResult` doc).
          if (entry.marker.kind === "status") {
            return { ok: true, version, priorMarker: before.marker as string };
          }
          return { ok: true, version };
        },
      });
    },

    /**
     * Move the marker back. Mirror of `hide` — see its doc for the shared classification order. A
     * status marker restores to `priorMarker ?? restoreFallback`; a timestamp marker just clears the
     * column, since there is nothing to restore to.
     *
     * @complexity O(1), same shape as `hide`.
     */
    async unhide(unhideRequired): Promise<TrashMarkerResult> {
      return db.transaction({
        run: async () => {
          const { workspaceId, entityId, at, expectedVersion, priorMarker } = unhideRequired;
          const before = await readMarkerRow(workspaceId, entityId);
          if (!before) return { ok: false, reason: "not-found" };
          if (entry.versionColumn && expectedVersion !== null && before.version !== expectedVersion) {
            return { ok: false, reason: "version-changed" };
          }
          if (isMarkerValueLive(entry.marker, before.marker)) {
            // Already live -- idempotent success, no write.
            return { ok: true, version: entry.versionColumn ? (before.version ?? null) : null };
          }

          const set: TrashDbAssignment = {
            [markerKey]: entry.marker.kind === "timestamp" ? null : (priorMarker ?? entry.marker.restoreFallback),
          };
          if (touchKey) set[touchKey] = at;
          if (versionKey && entry.versionColumn) set[versionKey] = sql`${entry.versionColumn} + 1`;
          await db.updateWhere({ table: entry.table, set, where: baseWhere(workspaceId, entityId) });

          return { ok: true, version: await readVersion(workspaceId, entityId) };
        },
      });
    },

    /**
     * Physically removes the row. Never deletes a LIVE row or its {@link TrashEntry.purgeFirst}
     * children, even at a matching version (decision 6) — both checked before either delete runs,
     * same order as `adapters/form.ts`'s bespoke purge.
     *
     * @complexity O(k) delete statements for k `purgeFirst` tables, plus the row's own delete.
     */
    async purge(purgeRequired): Promise<TrashPurgeOutcome> {
      return db.transaction({
        run: async () => {
          const { workspaceId, entityId, expectedVersion } = purgeRequired;
          const row = await readMarkerRow(workspaceId, entityId);
          if (!row) return "already-gone";
          if (isMarkerValueLive(entry.marker, row.marker)) return "version-changed"; // never purge a live row
          if (entry.versionColumn && expectedVersion !== null && row.version !== expectedVersion) return "version-changed";

          for (const cascade of entry.purgeFirst ?? []) {
            await db.deleteWhere({ table: cascade.table, where: eq(cascade.parentIdColumn, entityId) });
          }

          const deleteWhere =
            entry.versionColumn && expectedVersion !== null
              ? and(baseWhere(workspaceId, entityId), eq(entry.versionColumn, expectedVersion))!
              : baseWhere(workspaceId, entityId);
          const deleted = await db.deleteWhere({ table: entry.table, where: deleteWhere });
          if (deleted > 0) return "purged";

          // Raced between the read above and this delete (single-writer SQLite under `BEGIN
          // IMMEDIATE` makes this unreachable in practice today, but the classification stays
          // correct if that ever changes): distinguish "gone" from "moved" the same way
          // `compareAndDelete` does.
          const stillThere = await db.selectOne({
            table: entry.table,
            columns: { id: entry.idColumn },
            where: baseWhere(workspaceId, entityId),
          });
          return stillThere ? "version-changed" : "already-gone";
        },
      });
    },
  };
}
