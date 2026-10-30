import type { Express, Request } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { MemberLoginError } from "#src/features/member-login/index";
import { prepareMemberChallenge, type MemberRecord } from "#src/features/members/index";
import { issueMemberSession } from "#src/features/members/index";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { checkMemberPost, checkMemberRequestLimits } from "./deps.js";
import { setMemberSessionCookie } from "./complete-sign-in.js";
import { currentOidcMember, memberOidcHeaders, memberOidcProviderId, sendMemberOidcError, type MemberOidcRouteDeps } from "./oidc-deps.js";

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
export async function unlinkMemberIdentity({ req, deps }: { req: Request; deps: MemberOidcRouteDeps }, _options = {}) {
  const current = await currentOidcMember({ req, deps: deps.members });
  if (!current) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  const providerId = memberOidcProviderId({ req });
  return deps.links.transaction(async () => {
    await deps.links.lockKey(`members:external-identities:${deps.members.workspaceId}`);
    await deps.links.lockKey(`trash:member:${deps.members.workspaceId}:${current.member.id}`);
    return unlinkLocked({ req, deps, providerId });
  });
}

/** Locked lifecycle step; a marker prevents anonymous auto-link even for an outstanding redirect.
 * @complexity O(s) sessions, one identity lookup/update and one member save.
 */
async function unlinkLocked({ req, deps, providerId }: { req: Request; deps: MemberOidcRouteDeps; providerId: string }, _options = {}) {
  const current = await currentOidcMember({ req, deps: deps.members });
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
  return issueMemberSession({ deps: deps.links, member, nowIso: now }, { userAgent: req.get("user-agent"), ip: resolveClientIp(req) });
}

/** Fresh member self-service only, same-origin JSON and the existing strict IP/member counters.
 * @complexity O(s) affected sessions; transactional helper owns all persistence.
 */
export function registerMemberUnlinkIdentityRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  app.post("/api/members/v1/workspaces/:workspaceId/identities/:providerId/unlink", async (req, res) => {
    memberOidcHeaders({ res });
    try {
      if (!checkMemberPost({ req, res, deps: deps.members })) return;
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length) {
        throw new MemberLoginError({ code: "LOGIN_INVALID" });
      }
      const current = await currentOidcMember({ req, deps: deps.members });
      if (!current) throw new MemberLoginError({ code: "LOGIN_INVALID" });
      if (!await checkMemberRequestLimits({ req, res, deps: deps.members, ipLimiter: deps.members.passwordSignInPerIpLimiter,
        identity: { key: current.member.id, limiter: deps.members.passwordSetPerMemberLimiter } })) return;
      const result = await unlinkMemberIdentity({ req, deps });
      setMemberSessionCookie({ res, rawToken: result.rawSessionToken, expiresAtIso: result.session.expiresAt });
      res.json({ ok: true });
    } catch (error) { sendMemberOidcError({ res, error }); }
  });
}
