import type { ClockPort, UUID } from "../ports";
import { updatePost, type PostRepoPort, type PostStatus } from "../../features/post";
import type { PresentationSettingsRepoPort } from "../../features/presentation";
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
 * once the presentation `version` field exists (REQ-05 / RT-006).
 */

/** Adapters an entity reverter may need to read/restore its entity. */
export interface ReverterDeps {
  postRepo: PostRepoPort;
  presentationRepo: PresentationSettingsRepoPort;
  clock: ClockPort;
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

/** Restores a post to the title/slug/bodyJson/status captured before the edit. */
export const postUpdateReverter: EntityReverter = {
  async currentVersion({ workspaceId, entityId, deps }) {
    const post = await deps.postRepo.findById({ workspaceId, id: entityId });
    return post ? post.version : null;
  },
  async applyInverse({ workspaceId, item, deps }) {
    const inverse = item.inversePayload as
      | { title: string; slug: string; bodyJson: Record<string, unknown>; status: PostStatus }
      | undefined;
    if (!inverse) {
      throw new Error("post reverter called without an inverse payload");
    }
    // updatePost bumps version by 1 and refreshes updatedAt — INV-04 (never restore the old number).
    await updatePost({
      deps: { repo: deps.postRepo, clock: deps.clock },
      input: {
        workspaceId,
        id: item.entityId,
        title: inverse.title,
        slug: inverse.slug,
        bodyJson: inverse.bodyJson as never,
        status: inverse.status,
      },
    });
  },
};

/** Registry pre-loaded with the v1 reverters. */
export function defaultRevertRegistry(): RevertRegistry {
  const registry = createRevertRegistry();
  registry.register("post", "update", postUpdateReverter);
  return registry;
}
