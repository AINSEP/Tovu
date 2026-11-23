import { pageGetRoute } from "@jini-ai/cms/admin-http/routes/pages/get-by-id";
import { pageListRoute } from "@jini-ai/cms/admin-http/routes/pages/list";
import { pageUpdateHtmlRoute } from "@jini-ai/cms/admin-http/routes/pages/update-html";
import { CONTENT_ENTRY_MAX_BODY_BYTES } from "@jini-ai/cms/admin-http/limits";
import { getAdminPostByIdOrSlug, listAdminPages, PostNotFoundError, type PostRecord } from "#src/features/post/index";
import {
  DEFAULT_PAGE_SKELETON,
  PAGES_EDIT_HTML_PERMISSION,
  PageConcurrentEditError,
  PageKindMismatchError,
  PageNotFoundError,
} from "#src/features/pages/index";
import { toAdminPostResponse } from "#src/server/inbound/admin-http/http/posts";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { ContentRouteDeps, ContentRouteRegistrar } from "#src/server/inbound/admin-http/routes/content/deps";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { cappedApp } from "./capped-route-app.js";

/**
 * @file The admin Pages registrars (K1, RT-K1-adm-pages): `content.ts` registers them, in its own
 * order, from here.
 *
 * list, get-by-id and update-html are Jini route specs (`@jini-ai/cms/admin-http/routes/pages/*`)
 * mounted behind the admin ports; `ContentRouteDeps` is read only here, at registration, and each
 * mount builds that route's own small deps object. All three called `authorizeOrRespond`, so all
 * mount `"guarded"`, and each keeps its `sendAdminFailure` operation (and list its message) verbatim.
 * update-html keeps its 1 MiB content cap as this host's Express binding in front of the mount
 * (`cappedApp`), since its 413 body (`"Content too large to save."`) differs from http-kit's
 * `maxBodyBytes` refusal.
 *
 * create, update and delete stay hand-written Express routes for now: they read the `Idempotency-Key`
 * header, which a route spec's input (`body`/`query`/`params`) cannot see.
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

/**
 * PUT a Page's bespoke-HTML body (SPEC-047/ADR-056 REQ-4). The spec carries the route's own doc
 * (separate writer of html rows, first write births the row, `pages.edit_html` authorization history);
 * the host binds the permission, the starter skeleton, the per-Page store factory and its error classes.
 */
export const registerAdminPageUpdateHtmlRoute: ContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  const capped = cappedApp({ app, limit: rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }) });
  const updateHtmlDeps = {
    ...pagePortDeps({ deps }),
    editHtmlPermission: PAGES_EDIT_HTML_PERMISSION,
    defaultPageSkeleton: DEFAULT_PAGE_SKELETON,
    pagesHtmlStore: (scope: { workspaceId: string; postId: string; actorId: string }) => deps.pagesHtmlStore(scope),
    // Read per request: fixtures (and plugin reloads) replace `deps.pluginExports` after mounting.
    pluginExports: () => deps.pluginExports,
    findPostById: (input: { workspaceId: string; id: string }) => deps.postRepo.findById(input),
    toAdminPageResponse: ({ post }: { post: PostRecord }) => toAdminPostResponse(post),
    isPageKindMismatch: ({ err }: { err: unknown }) => err instanceof PageKindMismatchError,
    isPageNotFound: ({ err }: { err: unknown }) => err instanceof PageNotFoundError,
    isPageConcurrentEdit: ({ err }: { err: unknown }) => err instanceof PageConcurrentEditError,
  };
  mountAdminJsonRoute(
    { app: capped, spec: pageUpdateHtmlRoute, deps: updateHtmlDeps },
    { authorization: "guarded", failure: { operation: "routes/pages/update-html", code: "INTERNAL_ERROR" } },
  );
};
