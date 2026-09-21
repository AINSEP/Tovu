/**
 * @file `moveToTrash` — the ONE generic delete `POST /trash/items` (and, later, every per-domain
 * Delete button except Posts) calls into, for any kind registered in `TRASHABLE`. Design of record:
 * `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md` §3.
 *
 * This is deliberately a thin read-then-write, not a second place that decides what "trashed" means:
 * the marker flip and the `trashed_items` insert still happen inside `TrashPort.trash`
 * (`write-service.ts`), one transaction, exactly as every bespoke `remove*` path already works. What
 * this file adds is the part a bespoke `remove*` binding does not need — resolving WHICH kind, WHICH
 * permission and WHICH row, generically, from `TRASHABLE` alone, so a new registry entry needs no new
 * route and no new binding.
 *
 * Every outcome is a typed result, never a thrown error — same convention as `TrashMarkerResult`/
 * `RestoreOutcome`/`TrashPurgeOutcome` elsewhere in this feature, so the route (`routes/trash/
 * items.ts`) maps outcomes to status codes without a try/catch around a business decision.
 */
import { and, eq, type AnyColumn } from "drizzle-orm";

import { notTrashed } from "./not-trashed.js";
import type { TrashActor, TrashEntityType, TrashPort } from "./ports.js";
import type { TrashAuthorizeFn } from "./permissions.js";
import type { TrashRegistry } from "./registry.js";
import type { TrashDb } from "./db-port.js";

/**
 * Outcome of one `moveToTrash` call. `version` is the entity's version AFTER the flip (`null` for a
 * kind with no version column) — mirrors {@link TrashPort.trash}'s own success shape rather than
 * inventing a second one.
 */
export type MoveToTrashOutcome =
  | { ok: true; version: number | null }
  | { ok: false; reason: "unknown-type" }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "forbidden"; permission: string }
  | { ok: false; reason: "version-changed" };

/** The snapshot `moveToTrash` reads before calling `TrashPort.trash` — columns only, per every other
 *  Trash read in this feature. `subtitle`/`version` are present only when the entry declares them,
 *  which is exactly the shape `db.selectOne`'s conditional column set produces. */
interface EntitySnapshotRow {
  title: string;
  subtitle?: string | null;
  version?: number | null;
}

/**
 * Moves one entity of a `TRASHABLE` kind into the Trash.
 *
 * Flow (plan §3): resolve the kind → authorize the kind's own permission → read its live display and
 * version through {@link notTrashed} (a row that is missing OR already trashed reads as `not-found`
 * here — the caller cannot re-trash what is already gone from its own point of view) → call
 * `TrashPort.trash`, which performs the marker flip and the index insert as one transaction.
 *
 * `deps.clock` is not part of the plan's own literal deps list (`{ registry, trash, db, authorize }`)
 * but is required to produce `at` for `TrashPort.trash`: every other caller of `trash.trash` in this
 * codebase (the bespoke `remove*` bindings, this route's siblings) is handed a clock rather than a
 * fixed timestamp, and `moveToTrash`'s own required object has no `at` field per the plan's §0
 * signature list. Flagged as a deviation, not a silent addition.
 *
 * @complexity O(1): one authorize call, one indexed read, one `TrashPort.trash` call (itself O(1)).
 */
export async function moveToTrash(
  required: { workspaceId: string; entityType: TrashEntityType; entityId: string; actor: TrashActor },
  deps: {
    registry: TrashRegistry;
    trash: TrashPort;
    db: TrashDb;
    authorize: TrashAuthorizeFn;
    clock: { nowIso(): string };
  }
): Promise<MoveToTrashOutcome> {
  const entry = deps.registry.get(required.entityType);
  if (!entry) return { ok: false, reason: "unknown-type" };

  const decision = await deps.authorize({
    principalId: required.actor.principalId,
    permission: entry.permission,
    workspaceId: required.workspaceId,
    entityType: required.entityType,
    entityId: required.entityId,
  });
  if (!decision.allowed) return { ok: false, reason: "forbidden", permission: entry.permission };

  const columns: Record<string, AnyColumn> = { title: entry.display.title };
  if (entry.display.subtitle) columns.subtitle = entry.display.subtitle;
  if (entry.versionColumn) columns.version = entry.versionColumn;
  const row = (await deps.db.selectOne({
    table: entry.table,
    columns,
    join: entry.display.join,
    where: and(
      eq(entry.workspaceColumn, required.workspaceId),
      eq(entry.idColumn, required.entityId),
      notTrashed({ entityType: required.entityType }, { registry: deps.registry })
    )!,
  })) as EntitySnapshotRow | null;
  if (!row) return { ok: false, reason: "not-found" };

  const marker = await deps.trash.trash({
    workspaceId: required.workspaceId,
    entityType: required.entityType,
    entityId: required.entityId,
    actor: required.actor,
    display: { title: row.title, subtitle: row.subtitle ?? null },
    at: deps.clock.nowIso(),
    expectedVersion: entry.versionColumn ? (row.version ?? null) : null,
  });
  if (marker.ok) return { ok: true, version: marker.version };
  // A race between the read above and `trash.trash` itself (someone else trashed or edited the row
  // in between) — same two reasons `TrashMarkerResult`'s failure branch already distinguishes.
  return marker.reason === "not-found" ? { ok: false, reason: "not-found" } : { ok: false, reason: "version-changed" };
}
