/**
 * @file The one piece of SQL every `TrashAdapter` marker flip shares.
 *
 * All four phase-1 domains flip a marker the same way — set a column, stamp `updated_at`, bump
 * `version` — and differ only in which column and which literals. Expressing that once means the
 * compare-and-set, the not-found/version-changed classification and the idempotency rule cannot
 * drift between four copies.
 *
 * COLUMN-ONLY, deliberately: no payload is read, parsed or rebuilt anywhere in this file. That is
 * the contract clause (design §1.1) that lets a row with corrupt `fields_json` still be trashed and
 * restored — `widgets_trash_instance` fails today precisely because it round-trips the payload to
 * change a status.
 *
 * Every table and column name reaching the SQL below comes from a module constant in an adapter
 * file, never from a request. The only interpolation is those constants.
 */
import type Database from "better-sqlite3";

import type { TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";

export interface MarkerFlipSpec {
  client: Database.Database;
  /** Physical table name — a module constant, never caller input. */
  table: string;
  /** `SET` fragment for the marker and its timestamp, e.g. `deleted_at = ?, updated_at = ?`. */
  setSql: string;
  setParams: readonly unknown[];
  /** The state the row MUST be in before this flip, e.g. `deleted_at IS NULL`. */
  fromPredicate: string;
  /** Bindings for any `?` inside {@link MarkerFlipSpec.fromPredicate}, in SQL order. */
  fromParams?: readonly unknown[];
  workspaceId: string;
  entityId: string;
  /** `null` skips the compare-and-set — used for domains with no version column. */
  expectedVersion: number | null;
}

/**
 * Flips one row's marker under optimistic concurrency and classifies the outcome.
 *
 * Three outcomes, and the third is the subtle one:
 *  - the UPDATE matched → `{ ok: true, version }` with the version AFTER the bump;
 *  - no row with that id → `{ ok: false, reason: "not-found" }`;
 *  - a row exists but the UPDATE did not match → either the version moved (`"version-changed"`) or
 *    the row is ALREADY in the target state, which is reported as success. Re-trashing something
 *    already trashed must be a no-op rather than an error: media's own delete path is idempotent
 *    today and a sweeper retry must not turn a second attempt into a failure.
 *
 * @complexity O(1) — at most two indexed statements.
 */
export function flipMarker(spec: MarkerFlipSpec): TrashMarkerResult {
  const casSql = spec.expectedVersion === null ? "" : " AND version = ?";
  const casParams = spec.expectedVersion === null ? [] : [spec.expectedVersion];

  const updated = spec.client
    .prepare(
      `UPDATE "${spec.table}"
          SET ${spec.setSql}, version = version + 1
        WHERE workspace_id = ? AND id = ? AND ${spec.fromPredicate}${casSql}`
    )
    .run(...spec.setParams, spec.workspaceId, spec.entityId, ...(spec.fromParams ?? []), ...casParams);

  const current = spec.client
    .prepare(`SELECT version FROM "${spec.table}" WHERE workspace_id = ? AND id = ?`)
    .get(spec.workspaceId, spec.entityId) as { version: number } | undefined;

  if (updated.changes > 0) {
    return { ok: true, version: current?.version ?? null };
  }
  if (!current) return { ok: false, reason: "not-found" };
  if (spec.expectedVersion !== null && current.version !== spec.expectedVersion) {
    return { ok: false, reason: "version-changed" };
  }
  // The row exists at the expected version, so the only thing the UPDATE can have failed on is
  // `fromPredicate` — it is already in the target state.
  return { ok: true, version: current.version };
}

export interface CompareAndDeleteSpec {
  client: Database.Database;
  table: string;
  workspaceId: string;
  entityId: string;
  expectedVersion: number | null;
  /**
   * Rows in other tables keyed to this entity, removed only once the compare-and-delete has
   * matched. Runs inside whatever transaction the caller opened.
   */
  cascade?: (required: { workspaceId: string; entityId: string }) => void;
}

/**
 * Physically removes one row, but only while its version is still the one recorded at trash time.
 *
 * This is the predicate that makes restore always beat a purge: a restore bumps the version, so a
 * sweeper holding a stale `expectedVersion` stands down and the item survives. On every race the
 * safe outcome is the default.
 *
 * @complexity O(1) plus the cascade.
 */
export function compareAndDelete(spec: CompareAndDeleteSpec): TrashPurgeOutcome {
  const casSql = spec.expectedVersion === null ? "" : " AND version = ?";
  const casParams = spec.expectedVersion === null ? [] : [spec.expectedVersion];

  const deleted = spec.client
    .prepare(`DELETE FROM "${spec.table}" WHERE workspace_id = ? AND id = ?${casSql}`)
    .run(spec.workspaceId, spec.entityId, ...casParams);

  if (deleted.changes > 0) {
    spec.cascade?.({ workspaceId: spec.workspaceId, entityId: spec.entityId });
    return "purged";
  }

  const stillThere = spec.client
    .prepare(`SELECT 1 AS present FROM "${spec.table}" WHERE workspace_id = ? AND id = ?`)
    .get(spec.workspaceId, spec.entityId) as { present: number } | undefined;

  return stillThere ? "version-changed" : "already-gone";
}
