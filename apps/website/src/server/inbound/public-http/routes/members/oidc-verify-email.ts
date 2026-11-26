import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { captureMemberSignedIn, observeMemberSignInFailure } from "./analytics.js";
import type { Express, Request, Response, RequestHandler } from "express";
import { bindMemberOidcVerifyEmailRoute, verifyMemberOidcRouteOutcome, type MemberOidcVerifyEmailRouteDeps } from "@jini-ai/cms/public-http/routes/members/oidc-verify-email";
import { readOidcEmailProof, verifyMemberOidcEmailProof } from "@jini-ai/user-management/member-login/oidc-request";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { toPublicMemberResponse } from "@jini-ai/user-management/members/public-member-response";
import { checkMemberPost, toPublicMembersWriteServiceDeps } from "./deps.js";
import { MEMBER_AUTH_FAILURE, memberSessionCookie } from "./complete-sign-in.js";
import { memberLoginCallbackUrl } from "@jini-ai/user-management/member-login/oidc-login";
import { MEMBER_OIDC_PROOF_COOKIE, memberOidcContext, memberOidcCookieHeader,
  memberOidcHeaders, memberOidcProviderId, memberOidcRefusal, uniqueMemberCookie, type MemberOidcRouteDeps } from "./oidc-deps.js";

/**
 * @file Tovu's binding of the PUBLIC member OIDC email-proof route. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/oidc-verify-email`; this file binds the strict body parser, the
 * verification (proof cookie, sealed continuation, emailed challenge, federated link), the flow and session
 * cookies, the shared counter, the visitor analytics and the fail-closed `memberOidcRefusal`.
 */

/** Browser-bound emailed-code continuation. A wrong code retains its challenge attempt budget
 * in S2, and keeps this cookie for a bounded retry; success clears it. No identity comes from JSON.
 * Mounts the Jini spec; the counter is read per request, as the hand-written route did. O(1) setup.
 */
export const registerMemberOidcVerifyEmailRoute = ({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: MemberOidcRouteDeps }, _options = {}): void =>
  ((binding) => mountPublicRawRoute<MemberOidcVerifyEmailRouteDeps>({ errors,
    app: Object.assign(Object.create(app), { post: (path: string, handler: RequestHandler) => app.post(path, (req, res, next) => binding.preflight({ req, res }, () => handler(req, res, next))) }),
    spec: binding.spec, deps: binding.deps, failure: MEMBER_AUTH_FAILURE, workspaceId: deps.members.workspaceId,
  }, { requestDeps: ({ req, deps: base }) => binding.requestDeps({ request: { req, res: req.res! }, deps: base }) }))(
    bindMemberOidcVerifyEmailRoute({
      writeHeaders: ({ res }: { req: Request; res: Response }) => memberOidcHeaders({ res }),
      observe: ({ req, res }) => observeMemberSignInFailure({ deps: deps.members, request: req, response: res, method: "oidc" }),
      check: ({ req, res }) => checkMemberPost({ req, res, deps: deps.members }),
      deps: {
        ipLimiter: { check: input => deps.members.magicLinkCompleteAttemptLimiter.check(input) }, parseProof: ({ body }) => readOidcEmailProof({ body }),
        flowCookie: input => memberOidcCookieHeader(input), signedInLocation: "/account", refusalFor: ({ error }) => memberOidcRefusal({ error }),
      },
      requestDeps: ({ request: { req }, deps: base }) => ({ ...base,
        callbackUrl: () => memberLoginCallbackUrl({ origin: deps.protocol.origin, workspaceId: deps.members.workspaceId, providerId: memberOidcProviderId({ req }) }),
        verify: ({ proof }) => verifyMemberOidcRouteOutcome({
          readContext: () => memberOidcContext({ req, deps: deps.members }), readBrowserBinding: () => uniqueMemberCookie({ req, name: MEMBER_OIDC_PROOF_COOKIE }) ?? "",
          verify: ({ context, browserBinding }) => verifyMemberOidcEmailProof({ context, protocol: deps.protocol, browserBinding, proof,
            get links() { return { ...deps.links, onMemberCreated: toPublicMembersWriteServiceDeps(deps.members, { request: req }).onMemberCreated }; },
            get userAgent() { return req.get("user-agent"); }, get ip() { return resolveClientIp(req); },
          }),
          sessionCookie: result => memberSessionCookie({ rawToken: result.rawSessionToken, expiresAtIso: result.session.expiresAt }),
          announce: result => captureMemberSignedIn({ deps: deps.members, request: req, result, method: "oidc", workspaceId: deps.members.workspaceId }),
          member: result => toPublicMemberResponse({ member: result.member }),
        }),
      }),
    })
  );
