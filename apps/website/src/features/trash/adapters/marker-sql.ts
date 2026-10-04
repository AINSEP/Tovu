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
 * file, never from a request; Kysely quotes each one as an identifier. One Kysely body over the
 * content database's storage kernel, so the same statements run on SQLite, PGlite and Postgres.
 */
import { type Kysely, sql } from "kysely";

import type { ContentDatabase } from "../../../platform/db/content-database.generated.js";
import { type ContentKernel, contentKernel } from "../../../platform/db/content-kernel.js";
import type { SqliteConnectionSource } from "../../../platform/db/kernel/drivers/sqlite.js";
import { loose } from "../entry-sql.js";
import type { TrashMarkerResult, TrashPurgeOutcome } from "@jini-ai/cms/trash";

/** What a marker adapter is built over: the content kernel, or (while call sites still hold one)
 *  its SQLite handle. */
export type MarkerStore = ContentKernel | SqliteConnectionSource;

/**
 * The kernel behind `store`, resolved on first use rather than at adapter construction — a
 * composition root may hand in a lazy handle whose database should not open until needed.
 * @complexity O(1).
 */
export function lazyKernel(store: MarkerStore): () => ContentKernel {
  let resolved: ContentKernel | undefined;
  return () => (resolved ??= contentKernel(store));
}

/** The state a row must be in before a flip: `column <op> value` (`deleted_at is null`,
 *  `status <> 'trash'`). */
export interface MarkerPredicate {
  column: string;
  op: "is" | "is not" | "=" | "<>";
  value: string | null;
}

export interface MarkerFlipSpec {
  kernel: ContentKernel;
  /** Physical table name — a module constant, never caller input. */
  table: string;
  /** Column values for the marker and its timestamp, e.g. `{ deleted_at: at, updated_at: at }`. */
  set: Record<string, string | null>;
  /** The state the row MUST be in before this flip. */
  from: MarkerPredicate;
  workspaceId: string;
  entityId: string;
  /** `null` skips the compare-and-set — used for domains with no version column. */
  expectedVersion: number | null;
}

/** The row's current version, or `undefined` when there is no such row. @complexity O(1). */
async function readVersion(db: Kysely<ContentDatabase>, table: string, workspaceId: string, entityId: string): Promise<number | undefined> {
  const row = await loose(db).selectFrom(table).select("version").where("workspace_id", "=", workspaceId).where("id", "=", entityId).executeTakeFirst();
  return row ? Number(row.version) : undefined;
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
 * The UPDATE and the version read-back share one transaction (a nested one joins the caller's), so
 * no other writer lands between them.
 *
 * @complexity O(1) — at most two indexed statements.
 */
export async function flipMarker(spec: MarkerFlipSpec): Promise<TrashMarkerResult> {
  return spec.kernel.transaction(async () => {
    const updated = await spec.kernel.run((db) => {
      let query = loose(db)
        .updateTable(spec.table)
        .set({ ...spec.set, version: sql`${sql.ref("version")} + 1` })
        .where("workspace_id", "=", spec.workspaceId)
        .where("id", "=", spec.entityId)
        .where(spec.from.column, spec.from.op, spec.from.value);
      if (spec.expectedVersion !== null) query = query.where("version", "=", spec.expectedVersion);
      return query.executeTakeFirst();
    });
    const current = await spec.kernel.run((db) => readVersion(db, spec.table, spec.workspaceId, spec.entityId));

    if (Number(updated.numUpdatedRows) > 0) {
      return { ok: true, version: current ?? null };
    }
    if (current === undefined) return { ok: false, reason: "not-found" };
    if (spec.expectedVersion !== null && current !== spec.expectedVersion) {
      return { ok: false, reason: "version-changed" };
    }
    return { ok: true, version: current };
  });
}

export interface CompareAndDeleteSpec {
  kernel: ContentKernel;
  table: string;
  workspaceId: string;
  entityId: string;
  expectedVersion: number | null;
  /**
   * Rows in other tables keyed to this entity, removed only once the compare-and-delete has
   * matched. Runs inside the same transaction.
   */
  cascade?: (required: { workspaceId: string; entityId: string }) => Promise<void>;
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
export async function compareAndDelete(spec: CompareAndDeleteSpec): Promise<TrashPurgeOutcome> {
  return spec.kernel.transaction(async () => {
    const deleted = await spec.kernel.run((db) => {
      let query = loose(db).deleteFrom(spec.table).where("workspace_id", "=", spec.workspaceId).where("id", "=", spec.entityId);
      if (spec.expectedVersion !== null) query = query.where("version", "=", spec.expectedVersion);
      return query.executeTakeFirst();
    });

    if (Number(deleted.numDeletedRows) > 0) {
      await spec.cascade?.({ workspaceId: spec.workspaceId, entityId: spec.entityId });
      return "purged";
    }

    const stillThere = await spec.kernel.run((db) => readVersion(db, spec.table, spec.workspaceId, spec.entityId));
    return stillThere !== undefined ? "version-changed" : "already-gone";
  });
}
