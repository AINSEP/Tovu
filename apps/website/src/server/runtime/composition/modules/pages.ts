import { pageGetRoute } from "@jini-ai/cms/admin-http/routes/pages/get-by-id";
import { pageListRoute } from "@jini-ai/cms/admin-http/routes/pages/list";
import { getAdminPostByIdOrSlug, listAdminPages, PostNotFoundError, type PostRecord } from "#src/features/post/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ContentRouteDeps, ContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/content/deps";

/**
 * @file The admin Pages registrars (K1, RT-K1-adm-pages): `content.ts` registers them, in its own
 * order, from here.
 *
 * list and get-by-id are Jini route specs (`@jini-ai/cms/admin-http/routes/pages/*`) mounted behind
 * the admin ports; `ContentRouteDeps` is read only here, at registration, and each mount builds that
 * route's own small deps object. Both read routes called `authorizeOrRespond`, so both mount
 * `"guarded"`, and each keeps its `sendAdminFailure` operation (and list its message) verbatim.
 *
 * create, update, update-html and delete stay hand-written Express routes for now: create/update/
 * update-html carry the 1 MiB content cap whose 413 body (`"Content too large to save."`) differs from
 * http-kit's `maxBodyBytes` refusal, and create/update/delete read the `Idempotency-Key` header,
 * which a route spec's input (`body`/`query`/`params`) cannot see.
 */

/** The two port fields every pages mount passes. `authorize` is read per request, as the hand-written
 *  routes read `deps.authorize`, so a later reassignment of it is still honoured. It drops the spec's
 *  `entityType`: the hand-written list/get never named one, and forwarding it would let a
 *  resource-scoped `content.read` grant match — an authorization change, not part of a move (the same
 *  rule the posts read mounts follow). */
function pagePortDeps({ deps }: { deps: ContentRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: ({ entityType: _entityType, ...params }) => deps.authorize(params) };
}

export const registerAdminPageListRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const listPageResponses = async ({ workspaceId }: { workspaceId: string }) => {
    const result = await listAdminPages({ deps: { repo: deps.postRepo }, input: { workspaceId } });
    return result.posts.map(toAdminPostResponse);
  };
  mountAdminJsonRoute(
    { app, spec: pageListRoute, deps: { ...pagePortDeps({ deps }), listPageResponses } },
    { authorization: "guarded", failure: { operation: "routes/pages/list", code: "INTERNAL_ERROR", message: "Pages could not be loaded." } },
  );
};

export { registerAdminPageCreateRoute } from "#src/server/inbound/admin-http/routes/pages/create";

export const registerAdminPageGetRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const getDeps = {
    ...pagePortDeps({ deps }),
    readPage: (input: { workspaceId: string; idOrSlug: string }) => getAdminPostByIdOrSlug({ deps: { repo: deps.postRepo }, input }),
    toAdminPageResponse: ({ post }: { post: PostRecord }) => toAdminPostResponse(post),
    isPostNotFound: ({ err }: { err: unknown }) => err instanceof PostNotFoundError,
    // Read per request: fixtures (and plugin reloads) replace `deps.pluginExports` after mounting.
    pluginExports: () => deps.pluginExports,
  };
  mountAdminJsonRoute(
    { app, spec: pageGetRoute, deps: getDeps },
    { authorization: "guarded", failure: { operation: "routes/pages/get-by-id", code: "INTERNAL_ERROR" } },
  );
};

export { registerAdminPageUpdateRoute } from "#src/server/inbound/admin-http/routes/pages/update";
export { registerAdminPageUpdateHtmlRoute } from "#src/server/inbound/admin-http/routes/pages/update-html";
export { registerAdminPageDeleteRoute } from "#src/server/inbound/admin-http/routes/pages/delete";
