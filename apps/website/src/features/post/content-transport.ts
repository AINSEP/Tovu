import { contentHash, CONTENT_HASH_VERSION } from "#src/features/content-transport/content-hash";
import type { ContentTransportContributor, ContentTransportDeps, ContentTransportHandler, PackedEntity } from "#src/features/content-transport/type-registry";

import type { PostKind, PostRecord } from "./post.js";

/**
 * @file Task 2 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 2's
 * "`contributePostTransport()` / `contributePageTransport()` returning data only".
 *
 * A NEW file, deliberately NOT added to `features/post/tool-registrations.ts` (unlike the otherwise
 * near-identical `contributePostDuplicateHandlers` precedent there) — two other agents are actively
 * editing `post.ts`/its write call sites and the revision-ledger wiring around it this session; this
 * file only ever READS through `PostRepoPort` (`findById`/`findBySlug`/`list`), so it stays
 * insulated from that in-flight work. See `apply()`'s own doc below for the one deliberate scope cut
 * that follows from the same caution.
 *
 * Both contributors return DATA (plain `{entityType, dependsOn, build}` objects) and import only
 * `type-registry.ts`'s TYPES — never `registerContentTransportContributor` itself. Wiring the actual
 * registration call is the composition root's job
 * (`server/runtime/composition/content-transport-manifest.ts`), exactly like
 * `contributePostDuplicateHandlers()`'s own relationship to `registerDuplicateResourceHandler`. See
 * `type-registry.ts`'s header for why a value edge from here would reopen a real module cycle, and
 * `__tests__/post-no-direct-registry-import.boundary.test.ts` for the check that enforces it.
 */

/**
 * `post`'s and `page`'s declared prerequisite types (plan §3's own worked example: "post ->
 * [media, term]"). Both share it — a Page's body can embed media/taxonomy terms exactly like a
 * Post's can (same table, same `bodyJson` shape; `PostKind` only changes which admin list surfaces
 * a row — see `post.ts`'s own doc). Neither `media` nor `term` has a contributor registered yet, so
 * today this only documents the intended future ordering; the planner (Task 5+) is expected to
 * treat an unregistered dependency as "nothing to wait for", not a hard failure — that behavior
 * belongs to Task 5, not this file.
 */
const POST_AND_PAGE_DEPENDS_ON: readonly string[] = ["media", "term"];

/** `PostRecord` fields {@link contentHash} treats as this entity's real content — every field
 *  except `id`/`workspaceId`/`version`/`updatedAt` (which `content-hash.ts`'s own `canonicalize`
 *  already excludes unconditionally, so passing the whole record through is safe and simpler than
 *  hand-picking a subset that could silently drift from `PostRecord`'s own field list). */
function toHashableState(post: PostRecord): Record<string, unknown> {
  return { ...post };
}

/** Shared pack/inspect/precheck implementation behind both `"post"` and `"page"` contributors —
 *  mirrors `tool-registrations.ts`'s own `duplicatePostOrPage` precedent of one shared function
 *  parameterized by `kind`, rather than two near-duplicate handler bodies.
 *
 *  Deliberately reads `PostRepoPort` directly rather than going through `post.ts`'s
 *  `getAdminPostById`/`listAdminPosts` domain wrappers — those add admin-view formatting (public
 *  URL resolution, etc.) this feature has no use for, and this file's whole point is to stay off
 *  any code path currently in flux (this file's own header). */
function buildHandler(deps: ContentTransportDeps, kind: PostKind): ContentTransportHandler {
  const entityType = kind; // "post" | "page" — PostKind's two values are exactly this feature's two entityTypes.

  async function* pack(): AsyncIterable<PackedEntity> {
    const rows = await deps.postRepo.list({ workspaceId: deps.workspaceId });
    for (const row of rows) {
      if (row.kind !== kind) continue;
      yield {
        entityType,
        id: row.id,
        contentHash: contentHash(entityType, toHashableState(row)),
        hashVersion: CONTENT_HASH_VERSION,
        // Blob-reference detection (which media sha256s a body embeds) is Task 12's job (plan §5
        // risk #5: media is not a registered type until ids are preserved) — an empty list here is
        // a disclosed gap, not a silent one; see `PackedEntity.requiredBlobs`'s own doc.
        requiredBlobs: [],
        state: toHashableState(row),
      };
    }
  }

  async function inspect(id: string): Promise<{ version: number; hash: string } | null> {
    const found = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id });
    if (!found || found.kind !== kind) return null;
    return { version: found.version, hash: contentHash(entityType, toHashableState(found)) };
  }

  async function precheck(entity: PackedEntity): Promise<string | null> {
    const slug = entity.state.slug;
    if (typeof slug !== "string" || slug.length === 0) {
      return `${entityType} entity '${entity.id}' has no usable slug to check for a collision`;
    }
    const holder = await deps.postRepo.findBySlug({ workspaceId: deps.workspaceId, slug });
    if (holder && holder.id !== entity.id) {
      return `slug '${slug}' is already held by a different ${entityType} ('${holder.id}')`;
    }
    return null;
  }

  async function apply(): Promise<{ changeSetId: string }> {
    // DELIBERATELY NOT IMPLEMENTED YET. Plan §1.4: every import write must go through
    // `executeCommand` (the command gateway) wrapping `createPost`/`updatePost` from `post.ts`,
    // with `expectedVersion` threaded into the optimistic-concurrency guard (plan §5 risk #3). That
    // is Task 7/8's apply-loop work, not Task 2's — and `post.ts`'s create/update call sites are
    // under active concurrent edit by other agents THIS session (this file's own header), so wiring
    // a new caller onto them now would be building on a moving target for a path this task's own
    // tests never exercise (Task 2's test table covers only registry mechanics + the import-boundary
    // check — see `__tests__/type-registry.test.ts`). Throwing loudly here is safer than a
    // plausible-looking write path nobody has verified: a caller that reaches this before Task 8
    // lands gets an immediate, unambiguous failure instead of a silent no-op or a half-considered
    // write.
    throw new Error(
      `content-transport: ${entityType}.apply() is not implemented yet — Task 7/8 wires the real ` +
        "apply path through executeCommand + createPost/updatePost with expectedVersion."
    );
  }

  return { entityType, permission: "content.write", dependsOn: POST_AND_PAGE_DEPENDS_ON, pack, inspect, precheck, apply };
}

/**
 * `post`'s content-transport contribution. Resolves to `content.write` — the SAME permission
 * `content_post_create`/`content_post_update` already declare (no new permission invented for this
 * feature, mirroring `contributePostDuplicateHandlers`'s identical reasoning).
 *
 * Called from a composition root (`server/runtime/composition/content-transport-manifest.ts`), NOT
 * from within `features/post` itself — see this file's own header.
 */
export function contributePostTransport(): ContentTransportContributor {
  return { entityType: "post", dependsOn: POST_AND_PAGE_DEPENDS_ON, build: (deps) => buildHandler(deps, "post") };
}

/**
 * `page`'s content-transport contribution — same table, same repo, same handler shape as
 * {@link contributePostTransport}, distinguished only by `PostKind`. See that function's own doc.
 */
export function contributePageTransport(): ContentTransportContributor {
  return { entityType: "page", dependsOn: POST_AND_PAGE_DEPENDS_ON, build: (deps) => buildHandler(deps, "page") };
}
