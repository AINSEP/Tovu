import type { ClockPort, JsonObject, OutboxPort } from "@jini-ai/cms/core";
import { createRevertRegistry, type EntityReverter, type RevertRegistry } from "../../contracts/core/commands/index.js";
import { classifyStatusTransition, type PostRecord, type PostRepoPort, type PostStatus } from "./post.js";

/**
 * @file Post-domain entity reverters (ADR-018 C-005/C-006).
 *
 * Purpose:
 * The concrete `post/update` and `post/delete` inverse appliers `core/commands/revert.ts`'s
 * generic `RevertRegistry` dispatches to. Adapter code, not core: they need `PostRecord`/
 * `PostStatus`/`classifyStatusTransition` — real domain knowledge that belongs to this feature
 * module. Moved out of `core/commands/appliers.ts` (2026-08-13 features-post-deep-import-trace.md
 * Job 2) — see that file's header for why the split is correct and cost nothing observable.
 *
 * v1 scope: `post/update` and `post/delete` are the only two registered. A `presentation-settings`
 * reverter (reading the pre-edit value via `getEffective('core.presentation.activeThemeId', …)`)
 * was previously forward-reserved for here but never built — `features/presentation/` has no
 * reverter and no `version` field on its record (verified directly), so there was nothing to keep;
 * a future one belongs in `features/presentation/reverters.ts` alongside these, not folded into
 * `PostReverterDeps`.
 */

/** Adapters the post reverters need to read/restore a post. */
export interface PostReverterDeps {
  postRepo: PostRepoPort;
  clock: ClockPort;
  /** SPEC-008 (ADR-PIPE-008 Decision §5) — `updatePost` now requires an `outbox` in its own deps. */
  outbox: OutboxPort;
}

/**
 * `EntityReverter.currentActor` for both post reverters (Task 14b, 2026-09-18) — the raw
 * `actorId` that produced the post's CURRENT revision, read off the same `post_revisions` ledger
 * `d90c1174f` already stamps at every write call site. `.find` (not the last array element) so
 * this stays correct regardless of `listRevisions`' documented ascending-`seq` order: matching on
 * `seq === current` is the one predicate that is order-independent by construction. Shared by both
 * reverters rather than duplicated — same post repo, same lookup, same "no revisions yet" fallback.
 *
 * Returns `null` (never throws) when no revision matches, or the post predates this ledger
 * (`listRevisions` returns `[]` for it) — `revert.ts` already treats a `null` `currentActor`
 * resolution as "unknown, omit the actor from the message", which is the correct fallback here:
 * a resolution gap should degrade the conflict message, not fail the revert outright.
 */
async function resolveCurrentActor(
  deps: PostReverterDeps,
  { workspaceId, entityId }: { workspaceId: string; entityId: string }
): Promise<string | null> {
  const post = await deps.postRepo.findById({ workspaceId, id: entityId });
  if (!post) return null;
  const revisions = await deps.postRepo.listRevisions({ workspaceId, postId: entityId });
  const matching = revisions.find((revision) => revision.seq === post.version);
  return matching ? matching.actorId : null;
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
function createPostUpdateReverter(deps: PostReverterDeps): EntityReverter {
  return {
    async currentVersion({ workspaceId, entityId }) {
      const post = await deps.postRepo.findById({ workspaceId, id: entityId });
      return post ? post.version : null;
    },
    currentActor: (params) => resolveCurrentActor(deps, params),
    async applyInverse({ workspaceId, item }) {
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
}

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
 * SPEC-005 BR-08 reason spelled out on {@link createPostUpdateReverter}: an undo re-applies stored
 * state and must not fire `content.entry.beforeSave`. `updatePost` would also refuse outright — it
 * treats a trashed row as not-found.
 *
 * @complexity O(1) — one lookup plus one write.
 */
function createPostDeleteReverter(deps: PostReverterDeps): EntityReverter {
  return {
    async currentVersion({ workspaceId, entityId }) {
      // `findById` is trash-BLIND at the port layer (post.ts's PostRepoPort doc), which is exactly
      // what lets this read the version of the very row the revert guard needs to check.
      const post = await deps.postRepo.findById({ workspaceId, id: entityId });
      return post ? post.version : null;
    },
    currentActor: (params) => resolveCurrentActor(deps, params),
    async applyInverse({ workspaceId, item }) {
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
}

/** Builds the `post/update` and `post/delete` reverters, closed over the given adapters. */
export function createPostReverters(deps: PostReverterDeps): {
  update: EntityReverter;
  delete: EntityReverter;
} {
  return {
    update: createPostUpdateReverter(deps),
    delete: createPostDeleteReverter(deps),
  };
}

/**
 * Builds a `RevertRegistry` pre-loaded with the post-domain reverters — the composition-root
 * convenience `defaultRevertRegistry()` used to provide before the Job 2 inversion moved it here.
 */
export function createPostRevertRegistry(deps: PostReverterDeps): RevertRegistry {
  const registry = createRevertRegistry();
  const reverters = createPostReverters(deps);
  registry.register("post", "update", reverters.update);
  registry.register("post", "delete", reverters.delete);
  return registry;
}
