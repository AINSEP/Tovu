import { readRequestCookie } from "#src/server/http/request-cookie";
import type { Express } from "express";

import { contentPostGetRoute, type ContentPostGetRouteDeps } from "@jini-ai/cms/public-http/routes/content/posts/get-by-slug";
import { DefaultMemberAccessResolver, resolvePostMemberAccess } from "@jini-ai/user-management/members/access-resolver";
import type { MemberAccessResolver } from "@jini-ai/user-management/members/ports";
import type { RouteDeps, RouteRegistrar } from "#src/server/routes/types";
import { mountPublicJsonRoute } from "../../../../admin-http/admin-json-route-ports.js";
import { MEMBER_SESSION_COOKIE } from "../../../http/members.js";

/**
 * @file `GET /api/content/v1/workspaces/:workspaceId/posts/:slug`: the host binding of Jini's
 * `contentPostGetRoute` (see its file doc for the member gate and the `private, no-store` answer).
 * This file owns the member session cookie, the member access resolver and the visitor copy of the 500.
 */

/** No cookie-parser middleware is mounted. The shared reader preserves anonymous access
 * for direct handler tests with bare params and no headers, without duplicating pages.ts. */

/** Same `MemberAccessResolver` construction as `routes/site/pages.ts`'s own `createMemberAccessResolver`
 *  (ADR-030 §4) -- built per request from the three member repo ports already on `RouteDeps`, never a
 *  module-level singleton, for the same "tests inject their own in-memory repos per composition" reason
 *  that file's own doc gives. */
function createMemberAccessResolver(deps: RouteDeps): MemberAccessResolver {
  return new DefaultMemberAccessResolver({
    sessions: deps.memberSessionRepo,
    subscriptions: deps.memberSubscriptionRepo,
    tiers: deps.memberTierRepo,
  });
}

/** The context `resolveContext` answered, handed back to `decide` unchanged. */
type MemberContext = Parameters<MemberAccessResolver["decide"]>[0]["context"];

/** Placeholder for a request-bound dep at mount time; `requestDeps` replaces it on every request. */
const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

export const registerContentPostGetRoute: RouteRegistrar = ({ app, deps }, _options = {}) => {
  const mounted: ContentPostGetRouteDeps = {
    workspaceId: deps.workspaceId,
    postRepo: deps.postRepo,
    presentationRepo: deps.presentationRepo,
    sessionToken: boundPerRequest,
    memberAccess: () => {
      const resolver = createMemberAccessResolver(deps);
      return {
        resolveContext: (args) => resolver.resolveContext(args),
        decide: ({ memberAccessJson, context }) => resolver.decide({ access: resolvePostMemberAccess({ raw: memberAccessJson }), context: context as MemberContext }),
      };
    },
  };
  mountPublicJsonRoute({
    app: app as Express,
    spec: contentPostGetRoute,
    deps: mounted,
    workspaceId: deps.workspaceId,
    failure: { operation: "public:post", visitorError: "The site couldn’t load the post. Reload this page and report this error ID if it keeps happening." },
  }, {
    requestDeps: ({ req, deps: base }) => ({ ...base, sessionToken: () => readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }) }),
  });
};
