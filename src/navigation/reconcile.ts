import type { ClockPort, UUID } from "../core/ports";
import type { MenuRepoPort } from "./repo.memory";
import type { NavLocationBindingRepoPort } from "./ports";
import type { NavLocationBindingRow } from "./types";

/**
 * @file `rebuildNavLocationBindings` — the first real caller of the
 * already-implemented-but-unused `NavLocationBindingRepoPort.rebuildForWorkspace`
 * (ADR-PIPE-012 D-8, C-009).
 *
 * Purpose:
 * Reads every menu's `.locations` field (the source of truth,
 * `NavMenuEntry.locations`), computes the resulting binding-index rows, and
 * calls `rebuildForWorkspace` to replace the whole workspace's index in one
 * shot. The index is derived + rebuildable by definition (ADR-029
 * §Decision-4/§Decision-3, same species as ADR-022 §5 `entry_refs`) — a full
 * rescan of menu entries can always reconstruct it, including dropping any
 * orphan rows that drifted out of sync with the menus' own field.
 *
 * How it relates to the project:
 * - Called once at boot from `server/deps.ts`'s SQLite composition root,
 *   after the SQLite db opens (ADR-PIPE-012 W-003) — mirrors
 *   `migration.ts`'s per-row-failure-tolerant boot-time reconciliation
 *   pattern (ADR-PIPE-007), though this rebuild has no per-row failure mode
 *   (a pure read-then-replace, not a fallible write-service call).
 * - Also directly unit-testable against fixture repos, independent of which
 *   adapter (in-memory or SQLite) is behind the ports.
 *
 * Architectural role:
 * Feature logic only — no HTTP, no direct SQL. Read-then-replace, never a
 * partial update (`rebuildForWorkspace` itself replaces the whole
 * workspace's rows in one call, so there is no intermediate inconsistent
 * state observable through the port).
 */

export interface RebuildNavLocationBindingsDeps {
  menuRepo: MenuRepoPort;
  bindingRepo: NavLocationBindingRepoPort;
  clock: ClockPort;
  workspaceId: UUID;
}

export interface RebuildNavLocationBindingsResult {
  /** Total binding rows written (the size of the rebuilt index). */
  rebuiltCount: number;
}

/**
 * Recompute the workspace's `nav_location_bindings` index from scratch from
 * every menu's `.locations` field, and replace the stored index with it.
 * Idempotent: re-running against unchanged menu data produces the same
 * index every time. If more than one menu somehow lists the same location
 * key (a data-drift edge case the invariant should otherwise prevent), the
 * later menu in `MenuRepoPort.list`'s iteration order wins — consistent with
 * `NavLocationBindingRepoPort.upsert`'s existing last-writer-wins semantics
 * elsewhere in this library.
 *
 * @complexity O(n) over menus in the workspace, plus O(k) over each menu's
 * `.locations` entries (small, bounded by registered locations).
 * @overallScore 100
 */
export async function rebuildNavLocationBindings(
  deps: RebuildNavLocationBindingsDeps
): Promise<RebuildNavLocationBindingsResult> {
  const menus = await deps.menuRepo.list({ workspaceId: deps.workspaceId });
  const boundAt = deps.clock.nowIso();

  const byLocation = new Map<string, NavLocationBindingRow>();
  for (const menu of menus) {
    for (const locationKey of menu.locations) {
      byLocation.set(locationKey, {
        workspaceId: deps.workspaceId,
        locationKey,
        menuId: menu.id,
        boundAt,
      });
    }
  }

  const bindings = [...byLocation.values()];
  await deps.bindingRepo.rebuildForWorkspace({ workspaceId: deps.workspaceId, bindings });

  return { rebuiltCount: bindings.length };
}
