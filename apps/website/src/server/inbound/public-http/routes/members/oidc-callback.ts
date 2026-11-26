import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { captureMemberSignedIn, observeMemberSignInFailure } from "./analytics.js";
import { captureVisitorEvent } from "@jini-ai/analytics/site/visitor-analytics";
import type { Express, Request, Response } from "express";
import { bindMemberOidcCallbackRoute, completeMemberOidcRouteOutcome, type MemberOidcCallbackRouteDeps } from "@jini-ai/cms/public-http/routes/members/oidc-callback";
import {
  memberLoginCallbackUrl,
} from "@jini-ai/user-management/member-login/oidc-login";
import { completeMemberOidcCallback, requireOidcContinuationDelivery } from "@jini-ai/user-management/member-login/oidc-request";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { checkMemberRequestLimits, checkMemberWorkspace, toPublicMembersWriteServiceDeps } from "./deps.js";
import { MEMBER_AUTH_FAILURE, memberSessionCookie } from "./complete-sign-in.js";
import { MEMBER_OIDC_BINDING_COOKIE, memberOidcContext, memberOidcCookieHeader, memberOidcErrorLocation,
  memberOidcGetApp, memberOidcHeaders, memberOidcProviderId, MemberOidcCancelled, uniqueMemberCookie,
  type MemberOidcRouteDeps } from "./oidc-deps.js";

/**
 * @file Tovu's binding of the PUBLIC member OIDC callback route. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/oidc-callback`; this file binds the protocol completion (query
 * parser, binding cookie, code exchange, federated link, email continuation), the flow and session cookies, the
 * `/account` and `/signin` locations, the shared counters and the visitor analytics.
 */

const discarded = { setHeader: () => discarded, status: () => discarded, json: () => discarded };

/** Top-level callback: mounts the Jini spec, which clears proof on success, denial and malformed input and
 * answers a fixed /account redirect, the sealed email continuation or /signin#oidcError=<CODE>; logs no request
 * material. The counter is read per request, as the hand-written route did. O(1) setup.
 */
export const registerMemberOidcCallbackRoute = ({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: MemberOidcRouteDeps }, _options = {}): void =>
  ((binding) => mountPublicRawRoute<MemberOidcCallbackRouteDeps>({ errors,
    app: memberOidcGetApp({ app, deps: deps.members }), spec: binding.spec, deps: binding.deps, failure: MEMBER_AUTH_FAILURE, workspaceId: deps.members.workspaceId,
  }, { requestDeps: ({ req, deps: base }) => binding.requestDeps({ request: req, deps: base }) }))(
    bindMemberOidcCallbackRoute({
      writeHeaders: (req: Request) => memberOidcHeaders({ res: req.res! }),
      observe: req => observeMemberSignInFailure({ deps: deps.members, request: req, response: req.res!, method: "oidc" }),
      check: req => checkMemberWorkspace({ req, res: req.res!, deps: deps.members }),
      deps: {
        ipLimiter: { check: input => deps.members.magicLinkCompleteAttemptLimiter.check(input) }, flowCookie: input => memberOidcCookieHeader(input),
        errorLocation: ({ error }) => memberOidcErrorLocation({ error }), signedInLocation: "/account",
      },
      requestDeps: ({ request: req, deps: base }) => ({ ...base,
        callbackUrl: () => memberLoginCallbackUrl({ origin: deps.protocol.origin, workspaceId: deps.members.workspaceId, providerId: memberOidcProviderId({ req }) }),
        complete: () => completeMemberOidcRouteOutcome({
          readContext: () => memberOidcContext({ req, deps: deps.members }), readBrowserBinding: () => uniqueMemberCookie({ req, name: MEMBER_OIDC_BINDING_COOKIE }) ?? "",
          complete: ({ context, browserBinding }) => completeMemberOidcCallback({ context, protocol: deps.protocol, browserBinding: () => browserBinding,
            query: () => req.query, cancelled: () => new MemberOidcCancelled(),
            get links() { return { ...deps.links, onMemberCreated: toPublicMembersWriteServiceDeps(deps.members, { request: req }).onMemberCreated }; },
            get userAgent() { return req.get("user-agent"); }, get ip() { return resolveClientIp(req); },
            deliveryAllowed: ({ email }) => requireOidcContinuationDelivery({ check: () => checkMemberRequestLimits({ req, res: discarded as unknown as Response, deps: deps.members, email,
              emailLimiter: deps.members.magicLinkPerEmailLimiter, ipLimiter: deps.members.magicLinkPerIpLimiter }) }),
            continuationLocation: ({ providerId, challengeId, continuation }) => `/signin#${new URLSearchParams({ oidc: providerId, challengeId, continuation })}`,
          }),
          sessionCookie: result => memberSessionCookie({ rawToken: result.rawSessionToken, expiresAtIso: result.session.expiresAt }),
          announce: result => captureMemberSignedIn({ deps: deps.members, request: req, result, method: "oidc", workspaceId: deps.members.workspaceId }),
        }),
        onFailed: () => void captureVisitorEvent({ deps: deps.members, request: req, name: "member_sign_in_failed", properties: { method: "oidc", realm: "member", reasonClass: "authentication_failed" } }),
      }),
    })
  );
