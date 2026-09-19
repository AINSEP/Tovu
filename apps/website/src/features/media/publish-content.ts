import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import type { PackedEntity, PublishContentContributor, PublishContentDeps, PublishContentHandler } from "#src/features/publish-content/type-registry";

import type { MediaRecord } from "./index.js";

/**
 * @file Task 12 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 12.
 *
 * `media`'s publish-content contribution, mirroring `features/post/publish-content.ts`'s
 * `contributePostPublish()`/`contributePagePublish()` exactly: this function returns DATA (a plain
 * `{entityType, dependsOn, build}` object) and imports only `type-registry.ts`'s TYPES — never
 * `registerPublishContentContributor` itself. See that file's own header for why a value edge here
 * would reopen a real module cycle, and
 * `features/publish-content/__tests__/post-no-direct-registry-import.boundary.test.ts` for the check
 * that enforces it for `features/post` (the identical rule applies here by construction — this file
 * simply never imports the registration function at all).
 *
 * `dependsOn` is empty — media is a DEPENDENCY of `post`/`page`
 * (`POST_AND_PAGE_DEPENDS_ON = ["media", "term"]` in `features/post/publish-content.ts`), never the
 * reverse: an embedded image must exist at the destination before the post referencing it applies,
 * so nothing needs to land before media itself.
 *
 * `pack()`/`inspect()`/`precheck()` are real, working read paths (same as post/page's). `apply()` is
 * DELIBERATELY a stub, unlike `importMediaEntity()` itself (`./import-media-entity.ts`, which is the
 * real, fully tested write path this function is built to call) — see `apply()`'s own doc for why.
 */

/** Empty by design — see this file's header. */
const MEDIA_DEPENDS_ON: readonly string[] = [];

/** `MediaRecord` fields {@link contentHash} treats as this entity's real content — every field,
 *  mirroring `features/post/publish-content.ts`'s identical `toHashableState`: `content-hash.ts`'s
 *  own `canonicalize` already excludes `id`/`workspaceId`/`version`/`updatedAt` unconditionally, so
 *  passing the whole record through is safe and cannot silently drift from `MediaRecord`'s own field
 *  list the way hand-picking a subset could. */
function toHashableState(media: MediaRecord): Record<string, unknown> {
  return { ...media };
}

function buildHandler(deps: PublishContentDeps): PublishContentHandler {
  const entityType = "media";

  async function* pack(): AsyncIterable<PackedEntity> {
    // Absent `mediaRepo` (every caller before this feature's deps bag is widened for real — see
    // `type-registry.ts`'s `PublishContentDeps.mediaRepo` doc) degrades to "nothing to export",
    // never a crash — the same "type absent from the registry is absent from the bundle" contract
    // `type-registry.ts`'s own header rule 5 states for an unregistered type, applied here to a
    // registered-but-not-yet-wired one.
    if (!deps.mediaRepo) return;
    const rows = await deps.mediaRepo.list({ workspaceId: deps.workspaceId });
    for (const row of rows) {
      yield {
        entityType,
        id: row.id,
        contentHash: contentHash(entityType, toHashableState(row)),
        hashVersion: CONTENT_HASH_VERSION,
        // A media entity's own required blob is itself — the destination must hold these bytes
        // before this row can be applied, the exact case `PackedEntity.requiredBlobs` exists for.
        requiredBlobs: [row.source.sha256],
        state: toHashableState(row),
      };
    }
  }

  async function inspect(id: string): Promise<{ version: number; hash: string } | null> {
    if (!deps.mediaRepo) return null;
    const found = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id });
    if (!found) return null;
    return { version: found.version, hash: contentHash(entityType, toHashableState(found)) };
  }

  async function precheck(entity: PackedEntity): Promise<string | null> {
    if (!deps.mediaRepo) return `media entity '${entity.id}' cannot be prechecked — no mediaRepo wired for this deps bag`;
    const slug = entity.state.slug;
    // Unlike `post`'s precheck, an absent/empty slug does NOT block here — `media.slug` is
    // nullable/optional in practice (pre-backfill rows genuinely have none), so there is nothing to
    // check for a collision, not an error condition. See `import-media-entity.ts`'s identical
    // reasoning for the real write path.
    if (typeof slug !== "string" || slug.length === 0) return null;
    const holder = await deps.mediaRepo.findBySlug({ workspaceId: deps.workspaceId, slug });
    if (holder && holder.id !== entity.id) {
      return `slug '${slug}' is already held by a different media ('${holder.id}')`;
    }
    return null;
  }

  async function apply(): Promise<{ changeSetId: string }> {
    // DELIBERATELY NOT WIRED HERE, unlike `importMediaEntity()` itself (fully implemented and
    // tested — `./import-media-entity.ts`). Two real decisions this stub does NOT make, both
    // outside Task 12's scope and both belonging to whoever wires the planner/apply-loop (plan §4
    // tasks 5/7/8, actively in flight this session in `features/publish-content/` — see the
    // dispatching brief's own warning not to build on that moving target):
    //  1. Where `apply()` gets the entity's raw BYTES from. `PackedEntity.state` is JSON-only (no
    //     binary payload) — the real answer is almost certainly "read them back out of
    //     `blobStore` via `computeBlobStorageKey`, since Task 6's blob-preflight route already
    //     staged them there before the planner ever reaches an entity that requires them" but
    //     that is a planner-sequencing guarantee this file has no way to verify on its own.
    //  2. Whether media's `apply()` should route through the SAME command gateway
    //     (`executeCommand`) `post`'s own `apply()` doc says every type must (`type-registry.ts`'s
    //     `PublishContentDeps.changeSets` doc) — `media` has no revision ledger of its own today
    //     (`uploadMedia`/`updateMediaMetadata` write directly, never through `executeCommand`),
    //     so forcing one here would be a bigger, un-asked-for design decision, not "the smallest
    //     compliant fix".
    // `importMediaEntity()` is the ready-to-call primitive once both are decided — see its own
    // header for the full safety case it already provides.
    throw new Error(
      "publish-content: media.apply() is not wired yet — bytes retrieval + change-set participation " +
        "are Task 5/7/8's call; importMediaEntity() (features/media/import-media-entity.ts) is the " +
        "ready, tested write primitive once that's decided."
    );
  }

  return { entityType, permission: "content.write", dependsOn: MEDIA_DEPENDS_ON, pack, inspect, precheck, apply };
}

/**
 * `media`'s publish-content contribution. Resolves to `content.write` — the SAME permission
 * `post`/`page` already declare (no new permission invented for this feature, mirroring
 * `contributePostPublish`'s identical reasoning; media has no separate write permission of its own
 * in this codebase today).
 *
 * Called from a composition root (`server/runtime/composition/publish-content-manifest.ts`), NOT
 * from within `features/media` itself — see this file's own header.
 */
export function contributeMediaPublish(): PublishContentContributor {
  return { entityType: "media", dependsOn: MEDIA_DEPENDS_ON, build: buildHandler };
}
