import { captureMemberSignedIn } from "./analytics.js";
import { captureVisitorEvent } from "../../visitor-analytics.js";
import type { Express, Request, Response } from "express";
import { memberOidcCallbackRoute, type MemberOidcCallbackOutcome, type MemberOidcCallbackRouteDeps } from "@jini-ai/cms/public-http/routes/members/oidc-callback";
import {
  completeOidcLogin,
  memberLoginCallbackUrl,
  sealLoginEmailContinuation,
  type CompletedOidcLogin,
  type LoginContext,
} from "@jini-ai/user-management/member-login/oidc-login";
import { requestLoginEmailProof, resolveFederatedIdentity } from "@jini-ai/user-management/member-login/link-service";
import { MemberLoginError } from "@jini-ai/user-management/server";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { checkMemberRequestLimits, toPublicMembersWriteServiceDeps } from "./deps.js";
import { MEMBER_AUTH_FAILURE, memberSessionCookie } from "./complete-sign-in.js";
import { MEMBER_OIDC_BINDING_COOKIE, memberOidcContext, memberOidcCookieHeader, memberOidcErrorLocation,
  memberOidcGetApp, memberOidcProviderId, MemberOidcCancelled, uniqueMemberCookie,
  type MemberOidcRouteDeps } from "./oidc-deps.js";

/**
 * @file Tovu's binding of the PUBLIC member OIDC callback route. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/oidc-callback`; this file binds the protocol completion (query
 * parser, binding cookie, code exchange, federated link, email continuation), the flow and session cookies, the
 * `/account` and `/signin` locations, the shared counters and the visitor analytics.
 */

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

/** The shared member delivery limits for this top-level browser page. The API routes answer a
 * refusal with 429 JSON; here the one-time code is already spent, so a refusal becomes the fixed
 * sign-in error redirect instead (the route's catch), and the limiter's own response is discarded.
 * @throws {MemberLoginError} LOGIN_UNAVAILABLE when a limit refuses. @complexity O(1) limiter checks.
 */
async function assertEmailContinuationLimits(required: {
  req: Request; deps: MemberOidcRouteDeps; email: string;
}, _options = {}): Promise<void> {
  const { req, deps, email } = required;
  const discarded = { setHeader: () => discarded, status: () => discarded, json: () => discarded };
  const allowed = await checkMemberRequestLimits({ req, res: discarded as unknown as Response, deps: deps.members, email,
    emailLimiter: deps.members.magicLinkPerEmailLimiter, ipLimiter: deps.members.magicLinkPerIpLimiter });
  if (!allowed) throw new MemberLoginError({ code: "LOGIN_UNAVAILABLE" });
}

/** Keep validated identity sealed and browser-bound while the existing challenge owner proves
 * a non-authoritative mailbox. Fragment data is removed by U1 before rendering; no OAuth tokens.
 * @returns The browser binding the spec sets as the proof cookie, and the `/signin#…` continuation location.
 * @complexity O(1) seal/challenge issuance, with shared IP/email delivery limits before mail.
 */
async function continueByEmail(required: {
  req: Request; deps: MemberOidcRouteDeps; input: LoginContext;
  login: CompletedOidcLogin; browserBinding: string; email: string;
}, _options = {}): Promise<{ browserBinding: string; location: string }> {
  const { req, deps, input, login, browserBinding, email } = required;
  await assertEmailContinuationLimits({ req, deps, email });
  const continuation = await sealLoginEmailContinuation({ deps: deps.protocol, input: { ...input, browserBinding }, login });
  const proof = await requestLoginEmailProof({ deps: deps.links, input: { workspaceId: input.workspaceId, email } });
  const fragment = new URLSearchParams({ oidc: input.providerId, challengeId: proof.challengeId, continuation });
  return { browserBinding, location: `/signin#${fragment}` };
}

/** The protocol leg of the callback for this request: live member intent, the unique binding cookie, the
 * strict query parser, the one-time code exchange (S2) and the federated-identity link — then either the
 * signed-in session (cookie + event, written by the spec after it clears the proof cookie) or the email proof.
 * @complexity O(1) protocol/transaction calls; S2 owns bounded exchange and indexed persistence.
 */
async function completeCallback({ req, deps }: { req: Request; deps: MemberOidcRouteDeps }, _options = {}): Promise<MemberOidcCallbackOutcome> {
  const input = await memberOidcContext({ req, deps: deps.members });
  const browserBinding = uniqueMemberCookie({ req, name: MEMBER_OIDC_BINDING_COOKIE }) ?? "";
  const login = await completeOidcLogin({ deps: deps.protocol, input: { ...input, browserBinding, params: callbackParams({ req }) } });
  const linked = await resolveFederatedIdentity({ deps: { ...deps.links, onMemberCreated: toPublicMembersWriteServiceDeps(deps.members, { request: req }).onMemberCreated }, input: { workspaceId: input.workspaceId,
    identity: login.identity, startedAt: login.startedAt, connectMemberId: login.connectMemberId,
    userAgent: req.get("user-agent"), ip: resolveClientIp(req) } });
  if (linked.kind === "email_verification_required") {
    return { kind: "email_verification_required", continueByEmail: () => continueByEmail({ req, deps, input, login, browserBinding, email: linked.email }) };
  }
  return {
    kind: "signed_in",
    sessionCookie: () => memberSessionCookie({ rawToken: linked.result.rawSessionToken, expiresAtIso: linked.result.session.expiresAt }),
    announce: () => captureMemberSignedIn({ deps: deps.members, request: req, result: linked.result, method: "oidc", workspaceId: deps.members.workspaceId }),
  };
}

const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

/** Top-level callback: mounts the Jini spec, which clears proof on success, denial and malformed input and
 * answers a fixed /account redirect, the sealed email continuation or /signin#oidcError=<CODE>; logs no request
 * material. The counter is read per request, as the hand-written route did. O(1) setup.
 */
export function registerMemberOidcCallbackRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  const mounted: MemberOidcCallbackRouteDeps = {
    ipLimiter: { check: (input) => deps.members.magicLinkCompleteAttemptLimiter.check(input) },
    flowCookie: (input) => memberOidcCookieHeader(input),
    errorLocation: ({ error }) => memberOidcErrorLocation({ error }),
    signedInLocation: "/account",
    callbackUrl: boundPerRequest, complete: boundPerRequest, onFailed: boundPerRequest,
  };
  mountPublicRawRoute({
    app: memberOidcGetApp({ app, deps: deps.members }),
    spec: memberOidcCallbackRoute,
    deps: mounted,
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.members.workspaceId,
  }, {
    requestDeps: ({ req, deps: base }) => ({
      ...base,
      callbackUrl: () => callbackAddress({ req, deps }),
      complete: () => completeCallback({ req, deps }),
      onFailed: () => { void captureVisitorEvent({ deps: deps.members, request: req, name: "member_sign_in_failed", properties: { method: "oidc", realm: "member", reasonClass: "authentication_failed" } }); },
    }),
  });
}

/** Compute cookie scope independently of member authentication so even a stale connect clears it.
 * @complexity O(1), one canonical-origin lookup; workspace already checked by the caller.
 */
export async function callbackAddress({ req, deps }: { req: Request; deps: MemberOidcRouteDeps }, _options = {}): Promise<string> {
  return memberLoginCallbackUrl({ origin: deps.protocol.origin, workspaceId: deps.members.workspaceId, providerId: memberOidcProviderId({ req }) });
}
