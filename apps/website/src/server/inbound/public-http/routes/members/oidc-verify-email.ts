import type { Express } from "express";
import { MemberLoginError, openLoginEmailContinuation, resolveFederatedIdentity } from "#src/features/member-login/index";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { toPublicMemberResponse } from "../../http/members.js";
import { checkMemberPost, checkMemberRequestLimits } from "./deps.js";
import { setMemberSessionCookie } from "./complete-sign-in.js";
import { callbackAddress } from "./oidc-callback.js";
import { MEMBER_OIDC_PATH, MEMBER_OIDC_PROOF_COOKIE, memberOidcContext, memberOidcCookie,
  memberOidcHeaders, sendMemberOidcError, uniqueMemberCookie, type MemberOidcRouteDeps } from "./oidc-deps.js";

/** Strict JSON DTO; callers cannot inject claims, intent or proof booleans. O(k) body keys. */
export function proofBody({ body }: { body: unknown }, _options = {}): { continuation: string; challengeId: string; code: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !Object.keys(record).every(key => ["continuation", "challengeId", "code"].includes(key))) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  const continuation = proofString({ value: record.continuation, maxLength: 8192 });
  const challengeId = proofString({ value: record.challengeId, maxLength: 255 });
  if (typeof record.code !== "string" || !/^\d{6}$/.test(record.code)) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  return { continuation, challengeId, code: record.code };
}

/** Bound opaque handles before cryptography or challenge repository work. O(1). */
export function proofString({ value, maxLength }: { value: unknown; maxLength: number }, _options = {}): string {
  if (typeof value !== "string" || !value || value.length > maxLength) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  return value;
}

/** Browser-bound emailed-code continuation. A wrong code retains its challenge attempt budget
 * in S2, and keeps this cookie for a bounded retry; success clears it. No identity comes from JSON.
 * @complexity O(1) sealed open and challenge/link calls; body capped by the existing member guard.
 */
export function registerMemberOidcVerifyEmailRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  app.post(`${MEMBER_OIDC_PATH}/verify-email`, async (req, res) => {
    memberOidcHeaders({ res });
    try {
      if (!checkMemberPost({ req, res, deps: deps.members })) return;
      if (!await checkMemberRequestLimits({ req, res, deps: deps.members, ipLimiter: deps.members.magicLinkCompleteAttemptLimiter })) return;
      const body = proofBody({ body: req.body });
      const input = await memberOidcContext({ req, deps: deps.members });
      const browserBinding = uniqueMemberCookie({ req, name: MEMBER_OIDC_PROOF_COOKIE }) ?? "";
      const login = await openLoginEmailContinuation({ deps: deps.protocol, input: { ...input, browserBinding, continuation: body.continuation } });
      const linked = await resolveFederatedIdentity({ deps: deps.links, input: { workspaceId: input.workspaceId,
        identity: login.identity, startedAt: login.startedAt, connectMemberId: login.connectMemberId,
        emailProof: { challengeId: body.challengeId, code: body.code }, userAgent: req.get("user-agent"), ip: resolveClientIp(req) } });
      if (linked.kind !== "signed_in") throw new MemberLoginError({ code: "LOGIN_INVALID" });
      memberOidcCookie({ res, callbackUrl: await callbackAddress({ req, deps }), kind: "proof" });
      setMemberSessionCookie({ res, rawToken: linked.result.rawSessionToken, expiresAtIso: linked.result.session.expiresAt });
      res.json({ member: toPublicMemberResponse(linked.result.member), returnPath: "/account" });
    } catch (error) { sendMemberOidcError({ res, error }); }
  });
}
