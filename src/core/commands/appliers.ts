import type { ChangeSetItemRecord, UUID } from "@jini-ai/cms/core";

/**
 * @file Inverse-applier registry (ADR-018 C-005/C-006).
 *
 * Purpose:
 * A generic `(entityType, operation)` -> `EntityReverter` registry that `revert.ts`'s
 * `revertChangeSet` consumes to (a) read an entity's current version for the revert guard and (b)
 * restore it from a change-set item's inverse payload. Keeps `revert.ts` free of per-entity-type
 * branching — new revertible entity types register an `EntityReverter` here.
 *
 * This file holds ONLY the generic mechanism — no feature-specific reverter lives here. That is a
 * 2026-08-13 inversion (`features-post-deep-import-trace.md` Job 2): `postUpdateReverter`/
 * `postDeleteReverter` used to live in this file and pulled in `features/post`/`features/settings`
 * directly, which tripped `core-no-server-or-app-imports` (ADR-018 Enforcement: "core/commands/*
 * must not import Express or any DB/adapter — depends only on core/ports"). Concrete reverters are
 * adapter code, not core, so they moved to `features/post/reverters.ts`; the composition roots
 * (`server/deps.ts`/`server/app.ts`) build and register them once at boot onto
 * `RouteDeps.revertRegistry`, the same place every other concrete adapter in this codebase gets
 * selected. `EntityReverter`'s methods dropped their `deps` parameter as part of the same move —
 * `features/post/reverters.ts`'s reverters close over their adapters at construction time instead,
 * since the composition roots already build `postRepo`/`clock`/`outbox` once per process and thread
 * the same instances through every request (verified via `src/index.ts`'s single
 * `createSqliteRouteDeps()`/`createRouteDeps()` call per boot) — closing over them here changes
 * nothing observable, it just moves where the closure happens.
 */

/** Restore + version-read behavior for one `(entityType, operation)`. */
export interface EntityReverter {
  /** Current entity version, or null when the entity no longer exists. */
  currentVersion(required: { workspaceId: UUID; entityId: UUID }): Promise<number | null>;
  /** Apply the item's inverse as a new write (bumps the entity version). */
  applyInverse(required: { workspaceId: UUID; item: ChangeSetItemRecord }): Promise<void>;
}

const registryKey = (entityType: string, operation: string): string =>
  `${entityType}:${operation}`;

/** A mutable registry of entity reverters keyed by `(entityType, operation)`. */
export interface RevertRegistry {
  register(entityType: string, operation: string, reverter: EntityReverter): void;
  resolve(entityType: string, operation: string): EntityReverter | undefined;
}

export function createRevertRegistry(): RevertRegistry {
  const map = new Map<string, EntityReverter>();
  return {
    register(entityType, operation, reverter) {
      map.set(registryKey(entityType, operation), reverter);
    },
    resolve(entityType, operation) {
      return map.get(registryKey(entityType, operation));
    },
  };
}
