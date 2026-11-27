<<<<<<< HEAD
import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { captureVisitorEvent } from "../../visitor-analytics.js";
=======
import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
>>>>>>> origin/codex/tv-r2-ext-crp
import type { Express } from "express";
import { memberOidcStartRoute, type MemberOidcStartRouteDeps } from "@jini-ai/cms/public-http/routes/members/oidc-start";
import { beginOidcLogin, memberLoginCallbackUrl } from "@jini-ai/user-management/member-login/oidc-login";
import { MemberLoginError } from "@jini-ai/user-management/server";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { MEMBER_AUTH_FAILURE } from "./complete-sign-in.js";
import { memberOidcContext, memberOidcCookieHeader, memberOidcErrorLocation, memberOidcGetApp,
  type MemberOidcRouteDeps } from "./oidc-deps.js";

/**
 * @file Tovu's binding of the PUBLIC member OIDC start route. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/oidc-start`; this file binds the protocol start (server-controlled
 * workspace, live member intent), the flow cookie, the `/signin` error location, the shared per-IP counter and
 * the visitor analytics, and mounts it behind the no-store headers, failure observer and workspace gate.
 */

const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

/** Plain-link entry point: mounts the Jini spec. The counter is read per request, as the hand-written route did
 * (tests swap the limiter instances on `deps` after registration). O(1) setup.
 */
export function registerMemberOidcStartRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  const mounted: MemberOidcStartRouteDeps = {
    ipLimiter: { check: (input) => deps.members.passwordSignInPerIpLimiter.check(input) },
    flowCookie: (input) => memberOidcCookieHeader(input),
    errorLocation: ({ error }) => memberOidcErrorLocation({ error }),
    crossSiteRefusal: () => new MemberLoginError({ code: "LOGIN_INVALID" }),
    begin: boundPerRequest, onRequested: boundPerRequest, onFailed: boundPerRequest,
  };
  mountPublicRawRoute({ errors,
    app: memberOidcGetApp({ app, deps: deps.members }),
    spec: memberOidcStartRoute,
    deps: mounted,
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.members.workspaceId,
  }, {
    requestDeps: ({ req, deps: base }) => ({
      ...base,
      begin: async () => {
        const input = await memberOidcContext({ req, deps: deps.members });
        const callbackUrl = await memberLoginCallbackUrl({ origin: deps.protocol.origin, ...input });
        const result = await beginOidcLogin({ deps: deps.protocol, input });
        return { authorizationUrl: result.authorizationUrl, callbackUrl, browserBinding: result.browserBinding };
      },
      onRequested: () => { void captureVisitorEvent({ deps: deps.members, request: req, name: "member_sign_in_requested", properties: { method: "oidc", realm: "member" } }); },
      onFailed: () => { void captureVisitorEvent({ deps: deps.members, request: req, name: "member_sign_in_failed", properties: { method: "oidc", realm: "member", reasonClass: "authentication_failed" } }); },
    }),
  });
}
