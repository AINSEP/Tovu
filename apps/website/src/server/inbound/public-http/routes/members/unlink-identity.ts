import type { Express, RequestHandler } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { memberUnlinkIdentityRoute } from "@jini-ai/cms/public-http/routes/members/unlink-identity";
import { MemberLoginError } from "@jini-ai/user-management/server";
import { prepareMemberChallenge } from "@jini-ai/user-management/members/member-challenge-request";
import { type MemberRecord } from "@jini-ai/user-management/members/types";
import { issueMemberSession } from "@jini-ai/user-management/members/member-credentials";
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

/** Require a password or the existing mail owner's complete readiness check. Preparing never
 * persists/sends until deliver() is called; deliberately discard it here to avoid a second mail
 * availability policy that drifts from sign-in. O(1), bounded sender/status/origin reads.
 */
async function requireAlternativeSignIn({ deps, member }: { deps: MemberOidcRouteDeps; member: MemberRecord }, _options = {}): Promise<void> {
  const password = await deps.members.memberRepo.findPasswordHash({ workspaceId: deps.members.workspaceId, memberId: member.id });
  // The password owner refuses pending members even when an operator provisioned a hash.
  if (password && member.status === "active") return;
  if (!member.emailVerifiedAt) throw new MemberLoginError({ code: "LOGIN_BLOCKED" });
  try {
    await prepareMemberChallenge({ deps: deps.links, input: { workspaceId: deps.members.workspaceId, email: member.email }, purpose: "signin" });
  } catch { throw new MemberLoginError({ code: "LOGIN_BLOCKED" }); }
}

/** Unlink and revoke/reissue under the same locks and kernel as S2 link/Trash. Re-read session
 * after acquiring locks so concurrent unlink/disable cannot leave a replacement session usable.
 * @complexity O(s) revoked sessions; constant indexed identity/member reads, one transaction.
 */
export async function unlinkMemberIdentity({ request, deps }: { request: UnlinkRequest; deps: MemberOidcRouteDeps }, _options = {}) {
  const current = await currentOidcMember({ req: { headers: { cookie: request.cookieHeader } }, deps: deps.members });
  if (!current) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  const providerId = memberOidcProviderId({ req: { params: { providerId: request.providerId as string } } });
  return deps.links.transaction(async () => {
    await deps.links.lockKey(`members:external-identities:${deps.members.workspaceId}`);
    await deps.links.lockKey(`trash:member:${deps.members.workspaceId}:${current.member.id}`);
    return unlinkLocked({ request, deps, providerId });
  });
}

/** Locked lifecycle step; a marker prevents anonymous auto-link even for an outstanding redirect.
 * @complexity O(s) sessions, one identity lookup/update and one member save.
 */
async function unlinkLocked({ request, deps, providerId }: { request: UnlinkRequest; deps: MemberOidcRouteDeps; providerId: string }, _options = {}) {
  const current = await currentOidcMember({ req: { headers: { cookie: request.cookieHeader } }, deps: deps.members });
  if (!current) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  const now = nowIso({ clock: deps.members.clock });
  const age = Date.parse(now) - Date.parse(current.session.createdAt);
  if (!(age >= 0 && age <= 900000)) throw new MemberLoginError({ code: "LOGIN_BLOCKED" });
  const input = { workspaceId: deps.members.workspaceId, memberId: current.member.id, providerId };
  const identity = await deps.links.identities.findByMemberAndProvider(input);
  if (!identity || identity.unlinkedAt) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  await requireAlternativeSignIn({ deps, member: current.member });
  await deps.links.identities.unlink({ ...input, unlinkedAt: now });
  await deps.members.memberSessionRepo.revokeAllForMember({ workspaceId: input.workspaceId, memberId: input.memberId, revokedAt: now });
  const member = { ...current.member, credentialsRevokedAt: now, updatedAt: now, version: current.member.version + 1 };
  await deps.members.memberRepo.save(member);
  return issueMemberSession({ deps: deps.links, member, nowIso: now }, { userAgent: request.userAgent, ip: request.ip });
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
export function registerMemberUnlinkIdentityRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  // A raw mount: the reissued member cookie is appended after any cookie an earlier handler set, as `res.append` did.
  mountPublicRawRoute({
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
