/**
 * @file `createTableTrashAdapter` — the ONE `TrashAdapter` implementation for every `TRASHABLE` entry
 * (`registry.ts`), written once as ONE Kysely body over the content database's storage kernel
 * (`TrashDb`, `db-port.ts`) instead of once per domain — the same statements on SQLite, PGlite and
 * Postgres. Design of record: `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md`
 * §1. Supersedes the prior `t8f-trash-g1` handoff's sketch on one point: this file implements the
 * `"status"` marker kind fully, rather than throwing for it — the G1b dispatch asks for a tested
 * status-marker case, so there is no untested branch left to guard against with a thrown error.
 *
 * Reproduces the bespoke `flipMarker`/`compareAndDelete` pair's (`adapters/marker-sql.ts`) exact
 * contract, generically:
 *  - `hide`/`unhide` read the row FIRST, then classify not-found / version-changed / already-in-state
 *    / real transition, in that order — matching `flipMarker`'s precedence (a version mismatch always
 *    wins over "it's already in the target state"). Each runs in `kernel.transaction` holding
 *    `kernel.lockKey` for the row. The lock only orders Trash against Trash — a domain writer (the
 *    menu, term, form… update routes) never takes it, so on Postgres (READ COMMITTED) it can commit
 *    between the read and the write. The write therefore repeats the read's marker and version in its
 *    own `WHERE`, like `flipMarker`'s compound `UPDATE ... WHERE`, and 0 affected rows is
 *    `version-changed`.
 *  - `purge` never deletes a LIVE row or its `purgeFirst` children, even at a matching version
 *    (decision 6) — checked before either delete runs, same order as `adapters/form.ts`'s bespoke
 *    purge.
 *
 * T1 additions (blockers, the two-hop/phantom-row cascade — plan §2 T1 items 2/4/5): `purge`
 * resolves each `TrashCascadeSpec` generically (direct parent-id match, or the two-hop `via` join),
 * and, for a cascade that also declares `entityType`, reads the child ids BEFORE deleting them so
 * their `trashed_items` rows can be cleaned up in the same transaction (`trashed_items` is the
 * Trash's own core table, so it is named here, not passed in). `hide` gains one guard clause
 * ahead of the real transition for `TrashEntry.blocker`. Neither addition is type-specific: both read
 * entirely off the `TrashEntry`/`TrashCascadeSpec` the caller registered.
 */
import { type AliasedExpression, type Kysely, sql } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type { SqliteConnectionSource } from "../../platform/db/kernel/drivers/sqlite.js";
import { createSqliteTrashDb } from "./db-port.sqlite.js";
import type { TrashDb } from "./db-port.js";
import { entryWhere, loose, qualified } from "./entry-sql.js";
import type { TrashAdapter, TrashEntityType, TrashMarkerResult, TrashPurgeOutcome } from "./ports.js";
import type { TrashCascadeSpec, TrashEntry, TrashMarkerSpec } from "./registry.js";

/** The row shape every `hide`/`unhide`/`purge` read needs: the marker's raw value, plus the version
 *  column when the entry has one. */
interface MarkerRow {
  marker: unknown;
  version?: number | null;
}

/**
 * Whether a marker's raw column VALUE (already read from a row) currently means "live". The scalar
 * twin of `not-trashed.ts`'s SQL conditions (`notTrashed`/`isCurrentlyTrashed`) — this file always
 * has the value in hand from a prior read, not a `WHERE` clause left to build.
 *
 * @complexity O(1).
 */
function isMarkerValueLive(marker: TrashMarkerSpec, value: unknown): boolean {
  return marker.kind === "timestamp" ? value === null : value !== marker.trashed;
}

/** A row count off a write result: Kysely reports `bigint` on some drivers. @complexity O(1). */
function affected(value: bigint | number | undefined): number {
  return Number(value ?? 0);
}

/**
 * Builds one `TrashAdapter` for a single {@link TrashEntry}. Registered once per entry into the
 * adapter map at composition (`deps.ts`), exactly like every bespoke adapter.
 *
 * @param required.db the content database's kernel, or (while call sites still hold one) its SQLite
 *        handle.
 * @complexity O(1) to construct; each method is O(1) plus whatever index its `where` matches, plus
 *             O(k) for `purge`'s k `purgeFirst` cascades (each still a single indexed statement).
 */
export function createTableTrashAdapter(required: { entry: TrashEntry; db: TrashDb | SqliteConnectionSource }): TrashAdapter {
  const { entry } = required;
  // Resolved on first use, not here: a composition root may hand in a lazy proxy whose database
  // should not open until a Trash call actually needs it.
  let resolved: TrashDb | undefined;
  const kernel = (): TrashDb => (resolved ??= createSqliteTrashDb({ db: required.db }));
  const run = <T>(fn: (db: Kysely<ContentDatabase>) => Promise<T>): Promise<T> => kernel().run(fn);

  /** Serializes read-then-write sequences on one row (Postgres advisory lock; SQLite no-op). */
  const lockRow = (workspaceId: string, entityId: string) => kernel().lockKey(`trash:${entry.entityType}:${workspaceId}:${entityId}`);

  /**
   * Deletes the `trashed_items` rows of `childIds` for `childType` — the phantom-row cleanup
   * (`TrashCascadeSpec.entityType`). A no-op when there are no ids.
   *
   * @complexity O(1): one indexed `DELETE ... WHERE entity_type = ? AND entity_id IN (...)`.
   */
  async function cleanUpTrashedItemsRows(workspaceId: string, childType: TrashEntityType, childIds: readonly unknown[]): Promise<void> {
    if (childIds.length === 0) return;
    await run((db) =>
      db
        .deleteFrom("trashed_items")
        .where("workspace_id", "=", workspaceId)
        .where("entity_type", "=", childType)
        .where("entity_id", "in", childIds as string[])
        .execute()
    );
  }

  /** All values of `column` in `table` where `parentColumn = parentId`. @complexity O(k) matches. */
  async function selectIds(table: string, column: string, parentColumn: string, parentId: string): Promise<unknown[]> {
    const rows = await run((db) => loose(db).selectFrom(table).select(column).where(parentColumn, "=", parentId).execute());
    return rows.map((row) => row[column]);
  }

  /**
   * Runs one `purgeFirst` cascade: resolves the child ids (direct match, or the two-hop `via` join),
   * cleans up their `trashed_items` rows when the cascade declares `entityType`, then deletes the
   * child rows themselves — in that order, so the phantom-row cleanup can still see what it is about
   * to remove.
   *
   * @complexity O(1) reads plus O(1) deletes — every step is one indexed statement.
   */
  async function runCascade(workspaceId: string, entityId: string, cascade: TrashCascadeSpec): Promise<void> {
    if (cascade.via) {
      const via = cascade.via;
      const throughIds = await selectIds(via.throughTable, via.throughIdColumn, via.throughParentIdColumn, entityId);
      if (throughIds.length === 0) return; // nothing on the other side of the join to cascade to
      if (cascade.entityType) await cleanUpTrashedItemsRows(workspaceId, cascade.entityType, throughIds);
      await run((db) => loose(db).deleteFrom(cascade.table).where(via.matchColumn, "in", throughIds).execute());
      return;
    }

    // Direct case: `cascade.parentIdColumn` is always set when `via` is not (registration contract).
    const parentIdColumn = cascade.parentIdColumn!;
    if (cascade.entityType) {
      const childIds = await selectIds(cascade.table, cascade.idColumn!, parentIdColumn, entityId);
      await cleanUpTrashedItemsRows(workspaceId, cascade.entityType, childIds);
    }
    await run((db) => loose(db).deleteFrom(cascade.table).where(parentIdColumn, "=", entityId).execute());
  }

  /** @complexity O(1) plus whatever index the entry's `where` matches. */
  async function readMarkerRow(workspaceId: string, entityId: string): Promise<MarkerRow | null> {
    const row = await run((db) =>
      loose(db)
        .selectFrom(entry.table)
        .select((eb) => {
          const columns: AliasedExpression<unknown, string>[] = [eb.ref(qualified(entry.table, entry.marker.column)).as("marker")];
          if (entry.versionColumn) columns.push(eb.ref(qualified(entry.table, entry.versionColumn)).as("version"));
          return columns;
        })
        .where((eb) => entryWhere(eb, { entry, workspaceId, entityId }))
        .limit(1)
        .executeTakeFirst()
    );
    return (row as MarkerRow | undefined) ?? null;
  }

  /** Re-reads the version after a write — never chained off the write itself (no `RETURNING`, see
   *  `db-port.ts`'s file header). `null` for an entry with no version column.
   *  @complexity O(1) plus whatever index the entry's `where` matches. */
  async function readVersion(workspaceId: string, entityId: string): Promise<number | null> {
    if (!entry.versionColumn) return null;
    const row = await readMarkerRow(workspaceId, entityId);
    return row?.version ?? null;
  }

  /**
   * Writes the marker (plus the touch column, plus a version bump) on the one row — only if the row
   * still holds the `before` marker and version it was classified on. A domain writer never takes the
   * Trash's row lock, so on Postgres it can commit between the read and this write; the guard turns
   * that into 0 affected rows instead of trashing (or restoring) a version nobody confirmed.
   *
   * @returns whether the row was written; `false` means it changed since `before` was read.
   * @complexity O(1) plus whatever index the entry's `where` matches.
   */
  async function writeMarker(workspaceId: string, entityId: string, markerValue: unknown, at: string, before: MarkerRow): Promise<boolean> {
    const set: Record<string, unknown> = { [entry.marker.column]: markerValue };
    if (entry.touchColumn) set[entry.touchColumn] = at;
    if (entry.versionColumn) set[entry.versionColumn] = sql`${sql.ref(entry.versionColumn)} + 1`;
    const versionColumn = entry.versionColumn;
    const result = await run((db) =>
      loose(db)
        .updateTable(entry.table)
        .set(set)
        .where((eb) => {
          const markerRef = qualified(entry.table, entry.marker.column);
          const guards = [
            entryWhere(eb, { entry, workspaceId, entityId }),
            before.marker === null || before.marker === undefined ? eb(markerRef, "is", null) : eb(markerRef, "=", before.marker),
          ];
          if (versionColumn && before.version !== null && before.version !== undefined) {
            guards.push(eb(qualified(entry.table, versionColumn), "=", before.version));
          }
          return eb.and(guards);
        })
        .executeTakeFirst()
    );
    return affected(result.numUpdatedRows) > 0;
  }

  return {
    entityType: entry.entityType,

    /**
     * Move the entry's marker to hidden. Classification order (matches `flipMarker`, extended by T1
     * item 2): not-found -> version-changed -> already-in-state (idempotent, no write) -> blocked
     * (only when `entry.blocker` finds rows) -> real transition. `blocked` sits after the idempotent
     * check on purpose: re-hiding an already-trashed row must stay a true no-op even if a blocking
     * child has since appeared, since nothing is about to change.
     *
     * @complexity O(1): one read, at most one blocker count, at most one write, at most one re-read —
     *             all inside one transaction (a nested one joins the caller's).
     */
    async hide(hideRequired): Promise<TrashMarkerResult> {
      return kernel().transaction(async () => {
        const { workspaceId, entityId, at, expectedVersion } = hideRequired;
        await lockRow(workspaceId, entityId);
        const before = await readMarkerRow(workspaceId, entityId);
        if (!before) return { ok: false, reason: "not-found" };
        if (entry.versionColumn && expectedVersion !== null && before.version !== expectedVersion) {
          return { ok: false, reason: "version-changed" };
        }
        if (!isMarkerValueLive(entry.marker, before.marker)) {
          // Already trashed -- idempotent success, no write (mirrors `flipMarker`'s fallback branch).
          // `noop: true` (ports.ts) tells `withFollowUps` nothing actually changed here.
          return { ok: true, version: entry.versionColumn ? (before.version ?? null) : null, noop: true };
        }
        if (entry.blocker) {
          const blocker = entry.blocker;
          const counted = await run((db) =>
            loose(db)
              .selectFrom(blocker.table)
              .select((eb) => eb.fn.countAll().as("n"))
              .where(blocker.parentIdColumn, "=", entityId)
              .executeTakeFirst()
          );
          const count = Number(counted?.n ?? 0);
          if (count > 0) return { ok: false, reason: "blocked", code: blocker.code, count };
        }

        const written = await writeMarker(workspaceId, entityId, entry.marker.kind === "timestamp" ? at : entry.marker.trashed, at, before);
        if (!written) return { ok: false, reason: "version-changed" };

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
      return kernel().transaction(async () => {
        const { workspaceId, entityId, at, expectedVersion, priorMarker } = unhideRequired;
        await lockRow(workspaceId, entityId);
        const before = await readMarkerRow(workspaceId, entityId);
        if (!before) return { ok: false, reason: "not-found" };
        if (entry.versionColumn && expectedVersion !== null && before.version !== expectedVersion) {
          return { ok: false, reason: "version-changed" };
        }
        if (isMarkerValueLive(entry.marker, before.marker)) {
          // Already live -- idempotent success, no write. `noop: true`, same as `hide`'s mirror
          // branch above.
          return { ok: true, version: entry.versionColumn ? (before.version ?? null) : null, noop: true };
        }

        const written = await writeMarker(
          workspaceId,
          entityId,
          entry.marker.kind === "timestamp" ? null : (priorMarker ?? entry.marker.restoreFallback),
          at,
          before
        );
        if (!written) return { ok: false, reason: "version-changed" };

        return { ok: true, version: await readVersion(workspaceId, entityId) };
      });
    },

    /**
     * Physically removes the row. Never deletes a LIVE row or its {@link TrashEntry.purgeFirst}
     * children, even at a matching version (decision 6) — both checked before either delete runs,
     * same order as `adapters/form.ts`'s bespoke purge. Each cascade runs through {@link runCascade}:
     * a direct parent-id match, or the two-hop `via` join, plus the phantom-`trashed_items`-row
     * cleanup when the cascade declares `entityType` (T1 items 4/5).
     *
     * @complexity O(k) cascades for k `purgeFirst` entries (each O(1) reads plus O(1) deletes), plus
     *             the row's own delete.
     */
    async purge(purgeRequired): Promise<TrashPurgeOutcome> {
      return kernel().transaction(async () => {
        const { workspaceId, entityId, expectedVersion } = purgeRequired;
        await lockRow(workspaceId, entityId);
        const row = await readMarkerRow(workspaceId, entityId);
        if (!row) return "already-gone";
        if (isMarkerValueLive(entry.marker, row.marker)) return "version-changed"; // never purge a live row
        if (entry.versionColumn && expectedVersion !== null && row.version !== expectedVersion) return "version-changed";

        for (const cascade of entry.purgeFirst ?? []) {
          await runCascade(workspaceId, entityId, cascade);
        }

        const versionColumn = entry.versionColumn;
        const result = await run((db) =>
          loose(db)
            .deleteFrom(entry.table)
            .where((eb) => {
              const base = entryWhere(eb, { entry, workspaceId, entityId });
              return versionColumn && expectedVersion !== null
                ? eb.and([base, eb(qualified(entry.table, versionColumn), "=", expectedVersion)])
                : base;
            })
            .executeTakeFirst()
        );
        if (affected(result.numDeletedRows) > 0) return "purged";

        // Raced between the read above and this delete (the row lock above makes this unreachable
        // in practice, but the classification stays correct if that ever changes): distinguish
        // "gone" from "moved" the same way `compareAndDelete` does.
        return (await readMarkerRow(workspaceId, entityId)) ? "version-changed" : "already-gone";
      });
    },
  };
}
