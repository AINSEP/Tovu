import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express, RequestHandler } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { memberUnlinkIdentityRoute } from "@jini-ai/cms/public-http/routes/members/unlink-identity";
import { unlinkMemberIdentity as jiniUnlinkMemberIdentity } from "@jini-ai/user-management/member-login/unlink-identity";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { checkMemberPost, type MemberPublicRouteDeps } from "./deps.js";
import { MEMBER_AUTH_FAILURE, memberSessionCookie } from "./complete-sign-in.js";
import { currentOidcMember, memberOidcHeaders, memberOidcProviderId, memberOidcRefusal, type MemberOidcRouteDeps } from "./oidc-deps.js";

/**
 * @file Tovu's unlink lifecycle for the PUBLIC identity-unlink route (locks, fresh-session window, alternative
 * sign-in, session revoke/reissue) and its registrar. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/unlink-identity`; this file binds the member cookie, the strict
 * shared counters and the fail-closed `memberOidcRefusal`.
 */

/** What the spec hands the unlink: the request's `Cookie` header, the raw provider path segment and the
 *  host-resolved client facts, in place of the Express request. */
type UnlinkRequest = { cookieHeader: string | undefined; providerId: string | undefined; userAgent: string | undefined; ip: string };

export async function unlinkMemberIdentity({ request, deps }: { request: UnlinkRequest; deps: MemberOidcRouteDeps }, _options = {}) {
  return jiniUnlinkMemberIdentity({ get workspaceId() { return deps.members.workspaceId; }, get providerId() { return request.providerId; },
    readCurrent: () => currentOidcMember({ req: { headers: { cookie: request.cookieHeader } }, deps: deps.members }),
    readProviderId: ({ providerId }) => memberOidcProviderId({ req: { params: { providerId: providerId as string } } }),
    get links() { return deps.links; },
    readPasswordHash: input => deps.members.memberRepo.findPasswordHash(input),
    revokeSessions: input => deps.members.memberSessionRepo.revokeAllForMember(input),
    saveMember: member => deps.members.memberRepo.save(member),
    nowIso: () => nowIso({ clock: deps.members.clock }), userAgent: request.userAgent, ip: request.ip,
  });
}

/** The app view the unlink spec is mounted on: the no-store/no-referrer headers, then `checkMemberPost`
 * (workspace 404, same-origin 403, 4 KiB post-parse 413) on the Express request, in the hand-written order.
 * @returns An `app` whose `post` still makes ONE `app.post(path, handler)` registration (route table unchanged).
 * @complexity O(1) setup; per request as `checkMemberPost`.
 */
function memberOidcPostApp({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): Express {
  // The origin policy and the post-parse cap read the whole Express request, which a spec cannot see.
  const view: Express = Object.create(app);
  const post = (path: string, handler: RequestHandler) => app.post(path, (req, res, next) => {
    memberOidcHeaders({ res });
    if (!checkMemberPost({ req, res, deps })) return;
    return handler(req, res, next);
  });
  view.post = post as unknown as Express["post"];
  return view;
}

/** `POST …/identities/:providerId/unlink`: mounts the Jini spec. The strict counters are read per request, as
 * the hand-written route did (tests swap the limiter instances on `deps` after registration). O(1) setup.
 */
export function registerMemberUnlinkIdentityRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  // A raw mount: the reissued member cookie is appended after any cookie an earlier handler set, as `res.append` did.
  mountPublicRawRoute({ errors,
    app: memberOidcPostApp({ app, deps: deps.members }),
    spec: memberUnlinkIdentityRoute,
    deps: {
      ipLimiter: { check: (input) => deps.members.passwordSignInPerIpLimiter.check(input) },
      perMemberLimiter: { check: (input) => deps.members.passwordSetPerMemberLimiter.check(input) },
      currentMemberId: async ({ cookieHeader }) => (await currentOidcMember({ req: { headers: { cookie: cookieHeader } }, deps: deps.members }))?.member.id ?? null,
      unlinkIdentity: (request) => unlinkMemberIdentity({ request, deps }),
      sessionCookie: (input) => memberSessionCookie(input),
      refusalFor: ({ error }) => memberOidcRefusal({ error }),
    },
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.members.workspaceId,
  });
}
