import { postCreateRoute } from "@jini-ai/cms/admin-http/routes/posts/create";
import { postUpdateRoute } from "@jini-ai/cms/admin-http/routes/posts/update";
import { postDeleteRoute } from "@jini-ai/cms/admin-http/routes/posts/delete";
import { postAutosaveDeleteRoute, postAutosaveGetRoute, postAutosavePutRoute } from "@jini-ai/cms/admin-http/routes/posts/autosave";
import { CONTENT_ENTRY_MAX_BODY_BYTES } from "@jini-ai/cms/admin-http/limits";
import { createPost, getAdminPostByIdOrSlug } from "#src/features/post/index";
import { PostNotFoundError, PostValidationError } from "@jini-ai/cms/posts/post";
import { normalizePostAuthor } from "@jini-ai/cms/posts/post-write-fields";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ContentRouteDeps, ContentRouteRegistrar } from "./content.js";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { cappedApp } from "./capped-route-app.js";
import {
  applyContentUpdate, contentWriteBaseDeps, contentWriteHostErrors, parsePostUpdateBody, postCreateInput, postIdLookup, postUpdateInverse, postWriteErrors, trashContentEntry,
} from "./content-write-bindings.js";

/**
 * @file The posts write registrars (K1, rt-l1-content). The autosave park, read and clear routes are
 * Jini specs (`@jini-ai/cms/admin-http/routes/posts/autosave`) mounted behind the admin ports; `RouteDeps`
 * is read only here, at registration. The autosave PUT keeps its 1 MiB cap as this host's Express
 * binding in front of the mount (`cappedApp`): its 413 copy ("Content too large to save.") is not the
 * kit's `maxBodyBytes` refusal.
 *
 * create, update and delete (`@jini-ai/cms/admin-http/routes/posts/{create,update,delete}`) are specs too
 * (w3 C1b): each opts into the `Idempotency-Key` request header (`readHeaders`), and is authorized by
 * the command gateway itself (`content.write`), so its mount's `authorize` port is never consulted.
 * Create and update keep the same host body cap (`cappedApp`); a DELETE carries no body.
 */

/** The one request header the content write specs read (an absent or empty one is no key). */
const IDEMPOTENCY_HEADERS = ["idempotency-key"];

/**
 * POST a new post through the command gateway (spec doc: `postCreateRoute`). `rejectOversizedJsonBody`
 * (Security review SEC-snapshot-and-post-create-2026-07-28, Finding 1) enforces api.spec.md §4's
 * documented 1 MiB route-layer body cap ahead of the handler, so an oversized request 413s before
 * `createPost`/the command gateway ever runs.
 */
export const registerAdminPostCreateRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const capped = cappedApp({ app, limit: rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }) });
  mountAdminJsonRoute({ app: capped, spec: { ...postCreateRoute, readHeaders: IDEMPOTENCY_HEADERS }, deps: {
    ...contentWriteBaseDeps({ deps }), ...contentWriteHostErrors, postErrors: postWriteErrors,
    createEntry: ({ workspaceId, id, actorId, body }) => createPost({
      deps: { repo: deps.postRepo, clock: deps.clock, beforeSaveHook: deps.pluginBeforeSaveHook, outbox: deps.outbox, authorAccounts: deps.userRepo },
      input: postCreateInput({ body, workspaceId, postId: id, actorId }),
    }),
  } }, { failure: { operation: "routes/posts/create", code: "INTERNAL_ERROR" } });
};

/**
 * PUT post through the command gateway (spec doc: `postUpdateRoute`), behind the same 1 MiB cap as
 * the create, since api.spec.md §4 scopes it to the update endpoints too.
 */
export const registerAdminPostUpdateRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const capped = cappedApp({ app, limit: rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }) });
  mountAdminJsonRoute({ app: capped, spec: { ...postUpdateRoute, readHeaders: IDEMPOTENCY_HEADERS }, deps: {
    ...contentWriteBaseDeps({ deps }), ...contentWriteHostErrors, postErrors: postWriteErrors,
    findPostId: postIdLookup({ deps }),
    updateInverse: postUpdateInverse,
    updateEntry: ({ id, actorId, body }) => applyContentUpdate({ deps, id, actorId, body: parsePostUpdateBody({ rawBody: body }) }),
  } }, { failure: { operation: "routes/posts/update", code: "INTERNAL_ERROR", message: "The post could not be saved." } });
};

/** DELETE (trash) a post through the command gateway (spec doc: `postDeleteRoute`); no body cap. */
export const registerAdminPostDeleteRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute({ app, spec: { ...postDeleteRoute, readHeaders: IDEMPOTENCY_HEADERS }, deps: {
    ...contentWriteBaseDeps({ deps }), postErrors: postWriteErrors,
    findPostId: postIdLookup({ deps }),
    trashEntry: trashContentEntry({ deps }),
  } }, { failure: { operation: "routes/posts/delete", code: "INTERNAL_ERROR" } });
};

/** The two port fields the autosave mounts pass. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a test's later reassignment of it is still honoured. It drops the
 *  spec's `entityType`: `authorizeOrRespond` here never named one, and forwarding it would let a
 *  resource-scoped `content.write` grant match — an authorization change for the owner, not a move. */
function autosavePortDeps({ deps }: { deps: ContentRouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: ({ entityType: _entityType, ...params }) => deps.authorize(params) };
}

/** The id-or-slug lookup both autosave mounts share. `deps.postRepo` is read per request, as before. */
function autosaveLookupDeps({ deps }: { deps: ContentRouteDeps }, _options: Record<string, never> = {}) {
  return {
    ...autosavePortDeps({ deps }),
    findPostId: async (input: { workspaceId: string; idOrSlug: string }) => (await getAdminPostByIdOrSlug({ deps: { repo: deps.postRepo }, input })).post.id,
    isPostNotFound: ({ err }: { err: unknown }) => err instanceof PostNotFoundError,
  };
}

/**
 * Standing-draft autosave on `/posts/:postId/autosave`, kind-blind for Posts and Pages: PUT (behind
 * the host's body cap, see the file doc), then GET and DELETE — the same three registrations in the
 * same order. All three were `authorizeOrRespond` (`"guarded"`); their unexpected-failure copy keys
 * and messages are copied verbatim from the hand-written `sendAdminFailure` calls.
 */
export const registerAdminPostAutosaveRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const capped = cappedApp({ app, limit: rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }) });
  mountAdminJsonRoute({ app: capped, spec: postAutosavePutRoute, deps: {
    ...autosaveLookupDeps({ deps }),
    normalizeAuthor: ({ author }) => normalizePostAuthor({ author }),
    isPostValidation: ({ err }) => err instanceof PostValidationError,
    // Read per request, as the hand-written route read `deps.clock`.
    nowIso: () => deps.clock.nowIso(),
    writeAutosave: (input) => deps.postRepo.writeAutosave(input),
  } }, { authorization: "guarded", failure: { operation: "routes/posts/autosave/save", code: "INTERNAL_ERROR", message: "The post draft could not be saved." } });
  mountAdminJsonRoute({ app, spec: postAutosaveGetRoute, deps: {
    ...autosaveLookupDeps({ deps }),
    readAutosave: (input) => deps.postRepo.readAutosave(input),
  } }, { authorization: "guarded", failure: { operation: "routes/posts/autosave/read", code: "INTERNAL_ERROR", message: "The post draft could not be loaded." } });
  mountAdminJsonRoute({ app, spec: postAutosaveDeleteRoute, deps: {
    ...autosaveLookupDeps({ deps }),
    clearAutosave: (input) => deps.postRepo.clearAutosave(input),
  } }, { authorization: "guarded", failure: { operation: "routes/posts/autosave/clear", code: "INTERNAL_ERROR", message: "The post draft could not be cleared." } });
};
