import type { Express, Request, Response } from "express";
import { completeOidcLogin, memberLoginCallbackUrl, requestLoginEmailProof, resolveFederatedIdentity,
  sealLoginEmailContinuation, MemberLoginError, type CompletedOidcLogin, type LoginContext } from "#src/features/member-login/index";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { checkMemberRequestLimits, checkMemberWorkspace } from "./deps.js";
import { setMemberSessionCookie } from "./complete-sign-in.js";
import { MEMBER_OIDC_PATH, MEMBER_OIDC_BINDING_COOKIE, memberOidcContext, memberOidcCookie,
  memberOidcHeaders, memberOidcProviderId, MemberOidcCancelled, redirectMemberOidcError, uniqueMemberCookie,
  type MemberOidcRouteDeps } from "./oidc-deps.js";

/** Query parser rejects repeated/object values before OAuth can receive ambiguous credentials.
 * Provider denial takes the same fixed error path, after clearing the browser cookie; Cancel
 * (`access_denied`) only picks a kinder message. O(k) keys.
 */
export function callbackParams({ req }: { req: Request }, _options = {}) {
  const { code, state, error } = req.query;
  if (error === "access_denied") throw new MemberOidcCancelled();
  if (error !== undefined || typeof code !== "string" || typeof state !== "string") throw new MemberLoginError({ code: "LOGIN_INVALID" });
  if (!code || code.length > 4096 || !state || state.length > 16384) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  return { code, state };
}

/** Keep validated identity sealed and browser-bound while the existing challenge owner proves
 * a non-authoritative mailbox. Fragment data is removed by U1 before rendering; no OAuth tokens.
 * @complexity O(1) seal/challenge issuance, with shared IP/email delivery limits before mail.
 */
async function continueByEmail(required: {
  req: Request; res: Response; deps: MemberOidcRouteDeps; input: LoginContext;
  login: CompletedOidcLogin; browserBinding: string; callbackUrl: string; email: string;
}, _options = {}): Promise<void> {
  const { req, res, deps, input, login, browserBinding, callbackUrl, email } = required;
  if (!await checkMemberRequestLimits({ req, res, deps: deps.members, email,
    emailLimiter: deps.members.magicLinkPerEmailLimiter, ipLimiter: deps.members.magicLinkPerIpLimiter })) return;
  const continuation = await sealLoginEmailContinuation({ deps: deps.protocol, input: { ...input, browserBinding }, login });
  const proof = await requestLoginEmailProof({ deps: deps.links, input: { workspaceId: input.workspaceId, email } });
  memberOidcCookie({ res, callbackUrl, kind: "proof", binding: browserBinding });
  const fragment = new URLSearchParams({ oidc: input.providerId, challengeId: proof.challengeId, continuation });
  res.redirect(303, `/signin#${fragment}`);
}

/** Top-level callback clears proof on success, denial and malformed input, then calls S2 only.
 * Returns a fixed /account redirect, the sealed email continuation or /signin#oidcError=<CODE>;
 * logs no request material.
 * @complexity O(1) protocol/transaction calls; S2 owns bounded exchange and indexed persistence.
 */
export function registerMemberOidcCallbackRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  app.get(`${MEMBER_OIDC_PATH}/callback`, async (req, res) => {
    memberOidcHeaders({ res });
    try {
      if (!checkMemberWorkspace({ req, res, deps: deps.members })) return;
      // Clear before reading the untrusted cookie/query, including duplicate-cookie refusal.
      const callbackUrl = await callbackAddress({ req, deps });
      memberOidcCookie({ res, callbackUrl, kind: "callback" });
      if (!await checkMemberRequestLimits({ req, res, deps: deps.members, ipLimiter: deps.members.magicLinkCompleteAttemptLimiter })) return;
      const input = await memberOidcContext({ req, deps: deps.members });
      const browserBinding = uniqueMemberCookie({ req, name: MEMBER_OIDC_BINDING_COOKIE }) ?? "";
      const login = await completeOidcLogin({ deps: deps.protocol, input: { ...input, browserBinding, params: callbackParams({ req }) } });
      const linked = await resolveFederatedIdentity({ deps: deps.links, input: { workspaceId: input.workspaceId,
        identity: login.identity, startedAt: login.startedAt, connectMemberId: login.connectMemberId,
        userAgent: req.get("user-agent"), ip: resolveClientIp(req) } });
      if (linked.kind === "email_verification_required") {
        await continueByEmail({ req, res, deps, input, login, browserBinding, callbackUrl, email: linked.email });
        return;
      }
      memberOidcCookie({ res, callbackUrl, kind: "proof" });
      setMemberSessionCookie({ res, rawToken: linked.result.rawSessionToken, expiresAtIso: linked.result.session.expiresAt });
      res.redirect(303, "/account");
    } catch (error) { redirectMemberOidcError({ res, error }); }
  });
}

/** Compute cookie scope independently of member authentication so even a stale connect clears it.
 * @complexity O(1), one canonical-origin lookup; workspace already checked by the caller.
 */
export async function callbackAddress({ req, deps }: { req: Request; deps: MemberOidcRouteDeps }, _options = {}): Promise<string> {
  return memberLoginCallbackUrl({ origin: deps.protocol.origin, workspaceId: deps.members.workspaceId, providerId: memberOidcProviderId({ req }) });
}
