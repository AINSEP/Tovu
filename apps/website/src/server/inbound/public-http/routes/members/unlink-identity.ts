import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express, Request, Response, RequestHandler } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { bindMemberUnlinkIdentityRoute } from "@jini-ai/cms/public-http/routes/members/unlink-identity";
import { unlinkMemberIdentity as jiniUnlinkMemberIdentity } from "@jini-ai/user-management/member-login/unlink-identity";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { checkMemberPost } from "./deps.js";
import { MEMBER_AUTH_FAILURE, memberSessionCookie } from "./complete-sign-in.js";
import { currentOidcMember, memberOidcHeaders, memberOidcProviderId, memberOidcRefusal, type MemberOidcRouteDeps } from "./oidc-deps.js";

/**
 * @file Tovu's unlink lifecycle for the PUBLIC identity-unlink route (locks, fresh-session window, alternative
 * sign-in, session revoke/reissue) and its registrar. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/unlink-identity`; this file binds the member cookie, the strict
 * shared counters and the fail-closed `memberOidcRefusal`.
 */

/** `POST …/identities/:providerId/unlink`: mounts the Jini spec. The strict counters are read per request, as
 * the hand-written route did (tests swap the limiter instances on `deps` after registration). O(1) setup.
 */
export const registerMemberUnlinkIdentityRoute = ({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: MemberOidcRouteDeps }, _options = {}): void =>
  // A raw mount: the reissued member cookie is appended after any cookie an earlier handler set, as `res.append` did.
  ((binding) => mountPublicRawRoute({ errors,
    // The origin policy and the post-parse cap read the whole Express request, which a spec cannot see.
    app: Object.assign(Object.create(app), { post: (path: string, handler: RequestHandler) => app.post(path, (req, res, next) => binding.preflight({ req, res }, () => handler(req, res, next))) }),
    spec: binding.spec, deps: binding.deps, failure: MEMBER_AUTH_FAILURE, workspaceId: deps.members.workspaceId,
  }))(bindMemberUnlinkIdentityRoute({
    writeHeaders: ({ res }: { req: Request; res: Response }) => memberOidcHeaders({ res }), observe: () => undefined,
    check: ({ req, res }) => checkMemberPost({ req, res, deps: deps.members }),
    deps: {
      ipLimiter: { check: input => deps.members.passwordSignInPerIpLimiter.check(input) }, perMemberLimiter: { check: input => deps.members.passwordSetPerMemberLimiter.check(input) },
      currentMemberId: async ({ cookieHeader }) => (await currentOidcMember({ req: { headers: { cookie: cookieHeader } }, deps: deps.members }))?.member.id ?? null,
      unlinkIdentity: request => jiniUnlinkMemberIdentity({
        get workspaceId() { return deps.members.workspaceId; }, get providerId() { return request.providerId; },
        readCurrent: () => currentOidcMember({ req: { headers: { cookie: request.cookieHeader } }, deps: deps.members }),
        readProviderId: ({ providerId }) => memberOidcProviderId({ req: { params: { providerId: providerId as string } } }),
        get links() { return deps.links; }, readPasswordHash: input => deps.members.memberRepo.findPasswordHash(input),
        revokeSessions: input => deps.members.memberSessionRepo.revokeAllForMember(input), saveMember: member => deps.members.memberRepo.save(member),
        nowIso: () => nowIso({ clock: deps.members.clock }), userAgent: request.userAgent, ip: request.ip,
      }),
      sessionCookie: input => memberSessionCookie(input), refusalFor: ({ error }) => memberOidcRefusal({ error }),
    },
  }));
