import type { ClockPort, JsonObject, OutboxPort, UUID } from "../ports";
import {
  classifyStatusTransition,
  type PostRecord,
  type PostRepoPort,
  type PostStatus,
} from "../../features/post";
import type { SettingsRepoPort } from "../../features/settings/ports";
import type { ChangeSetItemRecord } from "./change-set";

/**
 * @file Inverse-applier registry (ADR-018 C-005/C-006).
 *
 * Purpose:
 * Maps a change-set item's `(entityType, operation)` to the code that (a) reads
 * the entity's current version for the revert guard and (b) restores the entity
 * from the item's inverse payload. Keeps `revert.ts` free of per-entity-type
 * branching — new revertible entity types register here.
 *
 * v1 scope: `post/update` is registered. `presentation-settings/update` lands
 * once the presentation `version` field exists (REQ-05 / RT-006) — that future
 * reverter will read the pre-edit value via `getEffective('core.presentation.
 * activeThemeId', …)` against `settingsRepo` below, not the retired
 * `PresentationSettingsRepoPort` (SPEC-007 REQ-08; ADR-PIPE-007 Migration
 * Safety). This field is unused until that reverter exists — it is re-pointed
 * now purely so nothing in this file depends on the retiring port.
 */

/** Adapters an entity reverter may need to read/restore its entity. */
export interface ReverterDeps {
  postRepo: PostRepoPort;
  settingsRepo: SettingsRepoPort;
  clock: ClockPort;
  /** SPEC-008 (ADR-PIPE-008 Decision §5) — `updatePost` now requires an `outbox` in its own deps. */
  outbox: OutboxPort;
}

/** Restore + version-read behavior for one `(entityType, operation)`. */
export interface EntityReverter {
  /** Current entity version, or null when the entity no longer exists. */
  currentVersion(
    required: { workspaceId: UUID; entityId: UUID; deps: ReverterDeps }
  ): Promise<number | null>;
  /** Apply the item's inverse as a new write (bumps the entity version). */
  applyInverse(
    required: { workspaceId: UUID; item: ChangeSetItemRecord; deps: ReverterDeps }
  ): Promise<void>;
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

/**
 * Restores a post to the title/slug/bodyJson/status/ext captured before the edit.
 *
 * **SPEC-005 CIC U-005-B1 / SM2 transition (`ESCALATE_SECURITY`) — read before editing:** this
 * restore MUST write through `deps.postRepo.save()` directly and MUST NEVER route through
 * `updatePost`/`createPost`. A revert re-applies a stored pre-image; it is not a genuine save, so
 * it must not fire `content.entry.beforeSave` (BR-08). Routing it through `updatePost` — which is
 * exactly what this reverter did before SPEC-005 T023 — would let a plugin that happens to be
 * enabled *now* stamp fresh `ext` onto a historical entry during someone else's undo, and would
 * make the restore depend on the contributing plugin still being installed, which AC-17 forbids.
 * Reverting is therefore a pure data write: `ext` is re-applied verbatim from the pre-image,
 * including the case where the pre-image has no `ext` at all (the reverted save was the one that
 * first created the namespace) — never merged with, or recomputed from, current state.
 *
 * `revert-plugin-ext.integration.test.ts` pins this via an observable side effect: `updatePost`
 * always calls `repo.findBySlug()` for its uniqueness check, and a correct revert never does.
 */
export const postUpdateReverter: EntityReverter = {
  async currentVersion({ workspaceId, entityId, deps }) {
    const post = await deps.postRepo.findById({ workspaceId, id: entityId });
    return post ? post.version : null;
  },
  async applyInverse({ workspaceId, item, deps }) {
    const inverse = item.inversePayload as
      | {
          title: string;
          slug: string;
          bodyJson: Record<string, unknown>;
          status: PostStatus;
          ext?: Record<string, unknown>;
        }
      | undefined;
    if (!inverse) {
      throw new Error("post reverter called without an inverse payload");
    }

    const existing = await deps.postRepo.findById({ workspaceId, id: item.entityId });
    if (!existing) {
      throw new Error(`post '${item.entityId}' was not found`);
    }

    // `ext` is destructured off the current record so the conditional spread below is the single
    // source of truth: a pre-image without `ext` restores to an entry without `ext` (AC-17).
    const { ext: _currentExt, ...carriedOver } = existing;
    const restored: PostRecord = {
      ...carriedOver,
      title: inverse.title,
      slug: inverse.slug,
      bodyJson: inverse.bodyJson as JsonObject,
      status: inverse.status,
      // Bump version by 1 and refresh updatedAt — INV-04 (never restore the old number). This is
      // what `updatePost` used to do for us; it is reproduced here rather than delegated.
      updatedAt: deps.clock.nowIso(),
      version: existing.version + 1,
      ...(inverse.ext !== undefined && Object.keys(inverse.ext).length > 0
        ? { ext: inverse.ext as JsonObject }
        : {}),
    };

    await deps.postRepo.save(restored);

    // Preserved from the previous `updatePost`-based implementation, deliberately: BR-08 forbids
    // re-firing the plugin hook, not the status-transition event. SEO's sitemap-cache
    // invalidation (SPEC-008 INV-010) subscribes to these, so dropping them would leave a stale
    // sitemap after a revert that publishes or unpublishes an entry.
    const transitionEventName = classifyStatusTransition(existing.status, restored.status);
    if (transitionEventName) {
      await deps.outbox.enqueue({
        id: `${restored.id}-${transitionEventName}-${restored.version}`,
        name: transitionEventName,
        occurredAt: restored.updatedAt,
        aggregateId: restored.id,
        workspaceId: restored.workspaceId,
        payload: { entryId: restored.id, contentType: restored.kind },
      });
    }
  },
};

/**
 * Restores a trashed post/page by clearing its soft-delete marker — the concrete reason
 * `deletePost` is a marker write rather than a `DELETE FROM` (see `features/post/post.ts`'s
 * `PostRecord.deletedAt`). A hard delete would leave this reverter with nothing to restore.
 *
 * The inverse payload is `{ deletedAt: null }` and nothing more, deliberately: a soft-deleted row
 * still carries every field it had, so there is no pre-image to re-apply — only a marker to clear.
 * Capturing a redundant copy of title/slug/bodyJson/status would create a second source of truth
 * that could disagree with the row itself.
 *
 * Writes through `deps.postRepo.save()` directly, never through `updatePost`, for the identical
 * SPEC-005 BR-08 reason spelled out on {@link postUpdateReverter}: an undo re-applies stored state
 * and must not fire `content.entry.beforeSave`. `updatePost` would also refuse outright — it treats
 * a trashed row as not-found.
 *
 * @complexity O(1) — one lookup plus one write.
 * @overallScore 100
 */
export const postDeleteReverter: EntityReverter = {
  async currentVersion({ workspaceId, entityId, deps }) {
    // `findById` is trash-BLIND at the port layer (post.ts's PostRepoPort doc), which is exactly
    // what lets this read the version of the very row the revert guard needs to check.
    const post = await deps.postRepo.findById({ workspaceId, id: entityId });
    return post ? post.version : null;
  },
  async applyInverse({ workspaceId, item, deps }) {
    const existing = await deps.postRepo.findById({ workspaceId, id: item.entityId });
    if (!existing) {
      throw new Error(`post '${item.entityId}' was not found`);
    }

    const restored: PostRecord = {
      ...existing,
      deletedAt: null,
      // Bump and refresh, never restore the old number — INV-04, same as postUpdateReverter.
      updatedAt: deps.clock.nowIso(),
      version: existing.version + 1,
    };

    await deps.postRepo.save(restored);

    // Symmetric to `deletePost`'s own emission: trashing a published entry emitted
    // `entry.unpublished`, so restoring one must emit `entry.published` or SEO's sitemap cache
    // stays stale. A restored draft emits nothing, exactly as trashing one did.
    const transitionEventName = classifyStatusTransition("draft", restored.status);
    if (transitionEventName) {
      await deps.outbox.enqueue({
        id: `${restored.id}-${transitionEventName}-${restored.version}`,
        name: transitionEventName,
        occurredAt: restored.updatedAt,
        aggregateId: restored.id,
        workspaceId: restored.workspaceId,
        payload: { entryId: restored.id, contentType: restored.kind },
      });
    }
  },
};

/** Registry pre-loaded with the v1 reverters. */
export function defaultRevertRegistry(): RevertRegistry {
  const registry = createRevertRegistry();
  registry.register("post", "update", postUpdateReverter);
  registry.register("post", "delete", postDeleteReverter);
  return registry;
}
