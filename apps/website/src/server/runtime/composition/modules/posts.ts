import { postAutosaveDeleteRoute, postAutosaveGetRoute } from "@jini-ai/cms/admin-http/routes/posts/autosave";
import { getAdminPostByIdOrSlug, PostNotFoundError } from "#src/features/post/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { registerAdminPostAutosaveWriteRoute } from "#src/server/inbound/admin-http/routes/posts/autosave";
import type { ContentRouteDeps, ContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/content/deps";

/**
 * @file The posts write registrars (K1, rt-l1-content). The autosave read and clear routes are Jini
 * specs (`@jini-ai/cms/admin-http/routes/posts/autosave`) mounted behind the admin ports; `RouteDeps`
 * is read only here, at registration.
 *
 * Still hand-written, registered by `content.ts` straight from their route files (same names, same order):
 * create, update and delete read the `Idempotency-Key` request header, which the server-neutral route
 * input (`body`/`query`/`params`) does not carry; create, update and the autosave PUT also answer
 * their 1 MiB cap with this host's own 413 copy, which a spec's `maxBodyBytes` does not reproduce.
 */

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
 * Standing-draft autosave on `/posts/:postId/autosave`, kind-blind for Posts and Pages: PUT (hand-
 * written, see the file doc), then GET and DELETE as Jini specs — the same three registrations in the
 * same order. GET/DELETE were `authorizeOrRespond` (`"guarded"`); their unexpected-failure copy keys
 * and messages are copied verbatim from the hand-written `sendAdminFailure` calls.
 */
export const registerAdminPostAutosaveRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  registerAdminPostAutosaveWriteRoute({ app, deps });
  mountAdminJsonRoute({ app, spec: postAutosaveGetRoute, deps: {
    ...autosaveLookupDeps({ deps }),
    readAutosave: (input) => deps.postRepo.readAutosave(input),
  } }, { authorization: "guarded", failure: { operation: "routes/posts/autosave/read", code: "INTERNAL_ERROR", message: "The post draft could not be loaded." } });
  mountAdminJsonRoute({ app, spec: postAutosaveDeleteRoute, deps: {
    ...autosaveLookupDeps({ deps }),
    clearAutosave: (input) => deps.postRepo.clearAutosave(input),
  } }, { authorization: "guarded", failure: { operation: "routes/posts/autosave/clear", code: "INTERNAL_ERROR", message: "The post draft could not be cleared." } });
};
