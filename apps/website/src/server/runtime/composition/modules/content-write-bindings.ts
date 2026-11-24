import { parseExpectedVersion, versionConflictEnvelope } from "@jini-ai/cms/posts/expected-version";
import { findMediaByIdOrSlug } from "@jini-ai/cms/media";
import { resolveFeaturedMediaIdForWrite } from "@jini-ai/cms/posts/featured-image";
import { PostConflictError, PostNotFoundError, PostValidationError, PostVersionConflictError, type PostRecord } from "@jini-ai/cms/posts/post";
import { processOutbox } from "#src/contracts/core/events/index";
import { createPost, deletePost, getAdminPostByIdOrSlug, restorePostForward, updatePost, type UpdatePostInput } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import { rejectPluginHookFailure } from "#src/server/inbound/admin-http/http/plugin-hook-error";
import type { AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ContentRouteDeps } from "./content.js";

/**
 * @file Tovu's half of the posts/pages create, update and delete route specs
 * (`@jini-ai/cms/admin-http/routes/{posts,pages}/{create,update,delete}`): the post service calls, the
 * body-to-input mapping typed against Tovu's own `createPost`/`updatePost` inputs, the rollback
 * inverses over `PostRecord`, the error classes and the outbox drain. Every collaborator reads
 * `deps.<field>` per request, as the hand-written routes did, so a test's later reassignment is honoured.
 */

type CreatePostInput = Parameters<typeof createPost>[0]["input"];

/** The fields every content write mount passes: the two port fields, the gateway's collaborators, the drain and the serializer. */
export function contentWriteBaseDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}) {
  const portDeps: AdminJsonRoutePortDeps = { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
  return {
    ...portDeps,
    // `authorize` is read per request: tests reassign `deps.authorize` after registration.
    commandDeps: { clock: deps.clock, idGen: deps.idGen, changeSets: deps.changeSets, outbox: deps.outbox, authorize: portDeps.authorize },
    drainOutbox: async (): Promise<void> => {
      await processOutbox({ outbox: deps.outbox, bus: deps.bus, clock: deps.clock });
    },
    toAdminPostResponse: ({ post }: { post: PostRecord }) => toAdminPostResponse(post),
    findEntry: ({ workspaceId, id }: { workspaceId: string; id: string }) => deps.postRepo.findById({ workspaceId, id }),
    // Compensates the post row, its revision ledger AND the Trash index row a delete wrote through
    // the injected `remove` port — `forgetRemoved` drops that row inside the same transaction as the
    // restore, so an undone delete cannot leave a live post listed in the Trash.
    restoreEntry: async ({ prior, actorId }: { prior: PostRecord; actorId: string }): Promise<void> => {
      await restorePostForward({
        deps: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox, forgetRemoved: deps.forgetRemovedPost },
        input: { prior, actorId },
      });
    },
  };
}

/** Tovu's post error classes as the specs' ladders read them, and the shared version-conflict body. */
export const postWriteErrors = {
  isValidation: ({ err }: { err: unknown }) => err instanceof PostValidationError,
  isConflict: ({ err }: { err: unknown }) => err instanceof PostConflictError,
  isVersionConflict: ({ err }: { err: unknown }) => err instanceof PostVersionConflictError,
  isNotFound: ({ err }: { err: unknown }) => err instanceof PostNotFoundError,
  // Body built by the shared boundary module, not spelled out here, so the `code` a client
  // branches on has exactly one definition across every arm that can produce this conflict.
  versionConflictBody: ({ err }: { err: unknown }) => versionConflictEnvelope({ err: err as PostVersionConflictError, outwardErrorMessage: ({ error }) => error.message }),
};

/** The plugin hook's `PLUGIN_HOOK_FAILED` refusal (Tovu's bound envelope) and the page-kind not-found error. */
export const contentWriteHostErrors = {
  rejectPluginHookFailure: ({ err }: { err: unknown }) => rejectPluginHookFailure({ err }),
  pageNotFound: ({ message }: { message: string }) => new PostNotFoundError(message),
};

/** The id-or-slug lookup the post update and delete resolve the URL with. `deps.postRepo` is read per request. */
export function postIdLookup({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}) {
  return async (input: { workspaceId: string; idOrSlug: string }) => (await getAdminPostByIdOrSlug({ deps: { repo: deps.postRepo }, input })).post.id;
}

/** The `createPost` input read off the request body; every field is forwarded only as the body supplies it. */
export function postCreateInput(required: { body: unknown; workspaceId: string; postId: string; actorId: string }, _optional = {}): CreatePostInput {
  // A body-less request reads every field as absent, exactly as `req.body?.x` did.
  const body = (required.body ?? {}) as Record<string, CreatePostInput[keyof CreatePostInput]>;
  return {
    workspaceId: required.workspaceId,
    id: required.postId,
    title: String(body.title ?? ""),
    slug: body.slug !== undefined ? String(body.slug) : undefined,
    bodyJson: body.bodyJson as CreatePostInput["bodyJson"],
    status: body.status as CreatePostInput["status"],
    author: body.author as CreatePostInput["author"],
    showAuthor: body.showAuthor as CreatePostInput["showAuthor"],
    // First Save sends the full editor snapshot; keep it in this atomic create.
    templateChoice: body.templateChoice as CreatePostInput["templateChoice"],
    overridesThemePage: body.overridesThemePage as CreatePostInput["overridesThemePage"],
    hideCoverImageInBody: body.hideCoverImageInBody as CreatePostInput["hideCoverImageInBody"],
    publishAt: body.publishAt as CreatePostInput["publishAt"],
    featuredMediaId: body.featuredMediaId as CreatePostInput["featuredMediaId"],
    actorId: required.actorId,
    analyticsSource: "admin",
  };
}

/** The page `createPost` input: kind `page`, and only the four fields the page editor sends. */
export function pageCreateInput(required: { body: unknown; workspaceId: string; pageId: string; actorId: string }, _optional = {}): CreatePostInput {
  const body = (required.body ?? {}) as Record<string, CreatePostInput[keyof CreatePostInput]>;
  return {
    workspaceId: required.workspaceId,
    id: required.pageId,
    title: String(body.title ?? ""),
    kind: "page",
    slug: body.slug !== undefined ? String(body.slug) : undefined,
    bodyJson: body.bodyJson as CreatePostInput["bodyJson"],
    status: body.status as CreatePostInput["status"],
    actorId: required.actorId,
    analyticsSource: "admin",
  };
}

/** This route's seven writable PUT fields, read off an untyped body in one place.
 *  Return type is pinned to `UpdatePostInput` itself (minus the id fields the
 *  route supplies separately) rather than left inferred, so a field this route
 *  stops forwarding — or a shape change in `UpdatePostInput` — fails to compile
 *  here instead of surfacing downstream in `updatePost`.
 *  @complexity O(1). */
export function parsePostUpdateBody(
  { rawBody }: { rawBody: unknown }, _options: Record<string, never> = {}
): Pick<
  UpdatePostInput,
  "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage" | "expectedVersion" | "publishAt" | "featuredMediaId" | "author" | "showAuthor" | "hideCoverImageInBody" | "slugFromTitle"
> {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    ...parsePageUpdateBody({ rawBody }),
    templateChoice: body.templateChoice as UpdatePostInput["templateChoice"],
    overridesThemePage: body.overridesThemePage as UpdatePostInput["overridesThemePage"],
    author: body.author as UpdatePostInput["author"],
    showAuthor: body.showAuthor as UpdatePostInput["showAuthor"],
    hideCoverImageInBody: body.hideCoverImageInBody as UpdatePostInput["hideCoverImageInBody"],
    slugFromTitle: body.slugFromTitle as UpdatePostInput["slugFromTitle"],
  };
}

/** The page PUT's writable fields (the post PUT's shared subset). @complexity O(1). */
export function parsePageUpdateBody({ rawBody }: { rawBody: unknown }, _optional = {}): Pick<UpdatePostInput, "title" | "slug" | "bodyJson" | "status" | "expectedVersion" | "publishAt" | "featuredMediaId"> {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    title: String(body.title ?? ""),
    slug: String(body.slug ?? ""),
    bodyJson: body.bodyJson as UpdatePostInput["bodyJson"],
    status: body.status as UpdatePostInput["status"],
    // Omitted ⇒ unchanged, `null` ⇒ cleared; `updatePost` validates both (scheduled publishing /
    // featured image, 2026-10-05).
    publishAt: body.publishAt as UpdatePostInput["publishAt"],
    featuredMediaId: body.featuredMediaId as UpdatePostInput["featuredMediaId"],
    // Validated, not cast — see `features/post/expected-version.ts`, which owns this rule for BOTH
    // arms that accept a basis (this route and the `content_post_update` agent tool). Every other
    // field above is either coerced (`title`/`slug`) or handed to `updatePost`'s own validation;
    // this one has no downstream validator at all, because `undefined` is a legitimate value there.
    expectedVersion: parseExpectedVersion({ raw: body.expectedVersion }),
  };
}

/** Applies a parsed post/page update through `updatePost`, with the featured-image check. */
export async function applyContentUpdate(
  { deps, id, actorId, body }: { deps: ContentRouteDeps; id: string; actorId: string; body: ReturnType<typeof parsePageUpdateBody> },
  _optional: Record<string, never> = {},
) {
  return updatePost({
    deps: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox, beforeSaveHook: deps.pluginBeforeSaveHook, slugChangeCapture: deps.slugChangeCapture },
    input: {
      workspaceId: deps.workspaceId,
      id,
      ...body,
      // The same image check the `content_post_update` chat tool runs (2026-10-05): a video,
      // unknown or trashed asset is a 400 here, and a media slug is stored as its id. Inside
      // `execute`, after the gateway's `content.write` check, so an unauthorized caller
      // cannot probe the media library through this field's error messages.
      featuredMediaId: await resolveFeaturedMediaIdForWrite({
        deps: { mediaRepo: deps.mediaRepo, findMediaByIdOrSlug, mediaContentTypeStore: deps.mediaContentTypeStore },
        input: { workspaceId: deps.workspaceId, featuredMediaId: body.featuredMediaId },
      }),
      actorId,
      analyticsSource: "admin",
    },
  });
}

/** The pre-edit field set the gateway stores as the inverse of a post update. */
export function postUpdateInverse({ prior: priorPost }: { prior: PostRecord }, _optional = {}) {
  return {
    title: priorPost.title,
    slug: priorPost.slug,
    bodyJson: priorPost.bodyJson,
    status: priorPost.status,
    templateChoice: priorPost.templateChoice ?? null,
    // Tri-state (2026-08-15) — `?? null`, not `?? false`. This is the rollback inverse: if
    // the pre-edit row was genuinely "never decided" (`undefined`/`null`) and the edit that
    // just ran set an explicit `true`/`false`, a gateway rollback must restore "never
    // decided", not silently manufacture an explicit "theme page wins" the author never
    // chose. Coalescing to `false` here would be the exact same coercion bug this whole
    // change removes, just relocated to the one path that only runs on failure.
    overridesThemePage: priorPost.overridesThemePage ?? null,
    // Scheduled publishing / featured image (2026-10-05) — `null` restores "none".
    publishAt: priorPost.publishAt ?? null,
    featuredMediaId: priorPost.featuredMediaId ?? null,
    author: priorPost.author ?? null,
    showAuthor: priorPost.showAuthor ?? false,
    // SPEC-005 BR-08 (T024) — the pre-edit plugin `ext` bag travels in the pre-image
    // alongside the core fields, so one revert restores both together. Spread
    // conditionally: an entry with no `ext` yet must produce an inverse payload with
    // no `ext` key, which is what restores it to "namespace absent" (AC-17).
    ...(priorPost.ext !== undefined ? { ext: priorPost.ext } : {}),
  };
}

/** The pre-edit field set the gateway stores as the inverse of a page update. */
export function pageUpdateInverse({ prior }: { prior: PostRecord }, _optional = {}) {
  return {
    title: prior.title,
    slug: prior.slug,
    bodyJson: prior.bodyJson,
    status: prior.status,
    publishAt: prior.publishAt ?? null,
    featuredMediaId: prior.featuredMediaId ?? null,
  };
}

/** The soft delete both delete specs run (`deletePost` writes the Trash index row through `remove`). */
export function trashContentEntry({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}) {
  return ({ workspaceId, id, actorId }: { workspaceId: string; id: string; actorId: string }) => deletePost({
    deps: { repo: deps.postRepo, clock: deps.clock, outbox: deps.outbox, remove: deps.removePost },
    input: { workspaceId, id, actorId },
  });
}
