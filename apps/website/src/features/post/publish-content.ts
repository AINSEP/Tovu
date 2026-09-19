import { executeCommand } from "@jini-ai/cms/core";

import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import type { PublishContentContributor, PublishContentDeps, PublishContentHandler, PackedEntity } from "#src/features/publish-content/type-registry";

import { createPost, updatePost } from "./post.js";
import type { PostKind, PostRecord } from "./post.js";

/**
 * @file Task 2 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 2's
 * "`contributePostPublish()` / `contributePagePublish()` returning data only".
 *
 * A NEW file, deliberately NOT added to `features/post/tool-registrations.ts` (unlike the otherwise
 * near-identical `contributePostDuplicateHandlers` precedent there).
 *
 * `apply()` (Task 8, 2026-09-18) is the one function here that writes — through `createPost`/
 * `updatePost` (the real domain functions, never the raw repo) wrapped in `executeCommand` (plan
 * §1.4), exactly like every other admin write route in this codebase. It requires
 * `PublishContentDeps.changeSets`/`authorize` to be wired — see its own doc below for why those stay
 * optional on the shared `PublishContentDeps` interface, and for the two authorship rules (Task 15)
 * it has to get right on the create path.
 *
 * Both contributors return DATA (plain `{entityType, dependsOn, build}` objects) and import only
 * `type-registry.ts`'s TYPES — never `registerPublishContentContributor` itself. Wiring the actual
 * registration call is the composition root's job
 * (`server/runtime/composition/publish-content-manifest.ts`), exactly like
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
function buildHandler(deps: PublishContentDeps, kind: PostKind): PublishContentHandler {
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

  /**
   * Task 8's real apply path: every write goes through `executeCommand` (plan §1.4) wrapping
   * `createPost`/`updatePost` — never `deps.postRepo` directly, so this write is auditable and
   * revertible exactly like an ordinary admin edit (a `change_sets` row with an inverse).
   *
   * `deps.changeSets`/`deps.authorize`/`deps.outbox` are all OPTIONAL on `PublishContentDeps`
   * (`type-registry.ts`'s own "absent behaves like it always did" convention for this interface) —
   * only a real `ContentTransportApplyPort`/`PublishContentApplyPort` composition
   * (`features/publish-content/apply-loop.ts`) supplies them, because only `apply()` routes a write
   * through the command gateway. `pack`/`inspect`/`precheck` never read any of the three, so a
   * caller that only needs those (Task 4's export route, Task 5/7's planner) is unaffected by them
   * being absent. Narrowed into local `const`s immediately below rather than read off `deps` again
   * later — TypeScript does not carry a closured parameter's narrowing across the rest of this
   * function body, and `updatePost`'s own `UpdatePostDeps.outbox` is REQUIRED (unlike this
   * interface's optional `outbox`), so the narrowing has to happen once, here.
   *
   * ## Authorship (Task 15) — the two ids this function must NOT conflate
   *
   * `input.principalId` (who is RUNNING this import) and the imported post's OWN author are
   * different facts and travel through two completely separate fields:
   * - `command.actor.id` is always `input.principalId` — the real, authenticated, authorized
   *   operator — for BOTH branches below. This is what `executeCommand`'s own `authorize()` call
   *   checks permission for for the change-set audit trail; it must never be an arbitrary id
   *   from a remote peer's own identity system that does not exist as a principal here (see the
   *   next paragraph for why the plan's own draft phrasing on this point cannot be followed literally).
   * - `createPost`'s `input.actorId` (the ONLY thing that becomes `PostRecord.createdByPrincipalId`,
   *   `content-hash.ts`'s excluded-from-hashing field) is read straight from the SOURCE entity's own
   *   `createdByPrincipalId` on the `created` path — never from `input.principalId` — per plan §4
   *   task 15: "do not let an importer re-stamp every post with the importing operator's id."
   *   `updatePost` never touches `createdByPrincipalId` at all (write-once, `UpdatePostInput` has no
   *   such field), so the `applied`/`forced` branch needs no special-casing for this — its own
   *   `actorId: input.principalId` only ever reaches the revision ledger, exactly as plan §4 task 15
   *   describes ("Revision-ledger actorId here is the IMPORTING OPERATOR").
   *
   * Disclosed deviation from the plan §1.4/§4 task 8 draft wording ("actor: {id: principal.id, kind:
   * 'api_key'}"): `CommandActor.kind` (`@jini-ai/cms/core`) is a real, closed union of `"user" |
   * "agent"` — there is no `"api_key"` member, and every other admin-write route in this codebase
   * (`routes/posts/{create,update}.ts`) uses `kind: "user"` regardless of whether the underlying
   * credential was a session cookie or an API key (the two are indistinguishable once resolved to a
   * `PrincipalRecord` — `dev-auth.ts`'s own doc). Using the SOURCE author as `command.actor.id`
   * instead (a plausible misreading of "the importer must copy the source's author") would also have
   * been a live bug: `executeCommand`'s `authorize()` call checks `command.actor.id`'s OWN
   * permissions, and a remote peer's author id is not a principal that exists in this instance's
   * identity system at all — every `created` import would then fail `ForbiddenError` (or worse,
   * silently authorize against an id that happens to collide). `kind: "user"` matches this
   * codebase's real type and every other real call site.
   *
   * @complexity O(1) plus `executeCommand`'s own cost (one `authorize()` call, one domain write, one
   * change-set insert) — no loop, no batching; the apply LOOP (`apply-loop.ts`) is what iterates a
   * report's rows and calls this once per row.
   */
  async function apply(input: {
    entity: PackedEntity;
    expectedVersion: number | undefined;
    principalId: string;
  }): Promise<{ changeSetId: string }> {
    const { changeSets, authorize, outbox } = deps;
    if (!changeSets || !authorize || !outbox) {
      throw new Error(
        `publish-content: ${entityType}.apply() requires PublishContentDeps.changeSets/authorize/` +
          "outbox — wire them from the real apply-loop composition root " +
          "(features/publish-content/apply-loop.ts)."
      );
    }
    const gatewayDeps = { clock: deps.clock, idGen: deps.idGen, changeSets, outbox, authorize };
    const source = input.entity.state as unknown as PostRecord; // trusted round-trip: this file's own pack() produced it.
    const summary = `Import ${entityType} '${input.entity.id}' via publish-content`;
    const actor = { id: input.principalId, kind: "user" as const };

    if (input.expectedVersion === undefined) {
      // "created" — no destination row existed at plan time. Task 15: authorship comes from the
      // SOURCE, never the importing operator (see this function's own doc above).
      const { changeSetId } = await executeCommand({
        deps: gatewayDeps,
        command: { workspaceId: deps.workspaceId, actor, summary, permission: "content.write" },
        mutation: {
          entityType,
          entityId: input.entity.id,
          operation: "create",
          captureInverse: async () => null, // nothing existed before this write.
          execute: () =>
            createPost({
              deps: { repo: deps.postRepo, clock: deps.clock, outbox, beforeSaveHook: deps.beforeSaveHook },
              input: {
                workspaceId: deps.workspaceId,
                id: input.entity.id,
                kind,
                title: source.title,
                slug: source.slug,
                bodyJson: source.bodyJson,
                status: source.status,
                actorId: typeof source.createdByPrincipalId === "string" ? source.createdByPrincipalId : undefined,
              },
            }),
          captureEntityVersion: (result) => result.post.version,
        },
      });
      return { changeSetId };
    }

    // "applied"/"forced" — an existing row, guarded by `expectedVersion` (plan §5 risk #3: a losing
    // write reports conflict and moves on, it never retries with a stale record — `updatePost`'s own
    // `saveIfVersion` atomic `UPDATE … WHERE version = ?` is what makes that true). The revision
    // ledger's actorId is the IMPORTING OPERATOR here, not the source author — see this function's
    // own doc; `updatePost` never touches `createdByPrincipalId` regardless, so Task 15's write-once
    // guarantee holds by construction on this path with no extra logic needed.
    let priorPost: PostRecord | null = null;
    const { changeSetId } = await executeCommand({
      deps: gatewayDeps,
      command: { workspaceId: deps.workspaceId, actor, summary, permission: "content.write" },
      mutation: {
        entityType,
        entityId: input.entity.id,
        operation: "update",
        captureInverse: async () => {
          priorPost = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: input.entity.id });
          return priorPost ? { ...priorPost } : null;
        },
        execute: () =>
          updatePost({
            deps: { repo: deps.postRepo, clock: deps.clock, outbox, beforeSaveHook: deps.beforeSaveHook },
            input: {
              workspaceId: deps.workspaceId,
              id: input.entity.id,
              title: source.title,
              slug: source.slug,
              bodyJson: source.bodyJson,
              status: source.status,
              templateChoice: source.templateChoice ?? null,
              overridesThemePage: source.overridesThemePage ?? null,
              expectedVersion: input.expectedVersion,
              actorId: input.principalId,
            },
          }),
        captureEntityVersion: (result) => result.post.version,
        rollback: async () => {
          if (priorPost) await deps.postRepo.save(priorPost);
        },
      },
    });
    return { changeSetId };
  }

  return { entityType, permission: "content.write", dependsOn: POST_AND_PAGE_DEPENDS_ON, pack, inspect, precheck, apply };
}

/**
 * `post`'s publish-content contribution. Resolves to `content.write` — the SAME permission
 * `content_post_create`/`content_post_update` already declare (no new permission invented for this
 * feature, mirroring `contributePostDuplicateHandlers`'s identical reasoning).
 *
 * Called from a composition root (`server/runtime/composition/publish-content-manifest.ts`), NOT
 * from within `features/post` itself — see this file's own header.
 */
export function contributePostPublish(): PublishContentContributor {
  return { entityType: "post", dependsOn: POST_AND_PAGE_DEPENDS_ON, build: (deps) => buildHandler(deps, "post") };
}

/**
 * `page`'s publish-content contribution — same table, same repo, same handler shape as
 * {@link contributePostPublish}, distinguished only by `PostKind`. See that function's own doc.
 */
export function contributePagePublish(): PublishContentContributor {
  return { entityType: "page", dependsOn: POST_AND_PAGE_DEPENDS_ON, build: (deps) => buildHandler(deps, "page") };
}
