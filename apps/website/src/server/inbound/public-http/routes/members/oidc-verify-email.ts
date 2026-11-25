import { captureMemberSignedIn, observeMemberSignInFailure } from "./analytics.js";
import type { Express, Request, RequestHandler } from "express";
import { memberOidcVerifyEmailRoute, type MemberOidcEmailProof, type MemberOidcVerifyEmailOutcome, type MemberOidcVerifyEmailRouteDeps } from "@jini-ai/cms/public-http/routes/members/oidc-verify-email";
import { openLoginEmailContinuation } from "@jini-ai/user-management/member-login/oidc-login";
import { resolveFederatedIdentity } from "@jini-ai/user-management/member-login/link-service";
import { MemberLoginError } from "@jini-ai/user-management/server";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { mountPublicRawRoute } from "#src/server/inbound/admin-http/admin-raw-route-ports";
import { toPublicMemberResponse } from "../../http/members.js";
import { checkMemberPost, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";
import { MEMBER_AUTH_FAILURE, memberSessionCookie } from "./complete-sign-in.js";
import { callbackAddress } from "./oidc-callback.js";
import { MEMBER_OIDC_PROOF_COOKIE, memberOidcContext, memberOidcCookieHeader,
  memberOidcHeaders, memberOidcRefusal, uniqueMemberCookie, type MemberOidcRouteDeps } from "./oidc-deps.js";

/**
 * @file Tovu's binding of the PUBLIC member OIDC email-proof route. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/oidc-verify-email`; this file binds the strict body parser, the
 * verification (proof cookie, sealed continuation, emailed challenge, federated link), the flow and session
 * cookies, the shared counter, the visitor analytics and the fail-closed `memberOidcRefusal`.
 */

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

/** Open the sealed continuation against this browser's proof cookie and link the identity with the emailed code.
 * @complexity O(1) sealed open and challenge/link calls.
 */
async function verifyEmailProof({ req, deps, proof }: { req: Request; deps: MemberOidcRouteDeps; proof: MemberOidcEmailProof }, _options = {}): Promise<MemberOidcVerifyEmailOutcome> {
  const input = await memberOidcContext({ req, deps: deps.members });
  const browserBinding = uniqueMemberCookie({ req, name: MEMBER_OIDC_PROOF_COOKIE }) ?? "";
  const login = await openLoginEmailContinuation({ deps: deps.protocol, input: { ...input, browserBinding, continuation: proof.continuation } });
  const linked = await resolveFederatedIdentity({ deps: { ...deps.links, onMemberCreated: toPublicMembersWriteServiceDeps(deps.members, { request: req }).onMemberCreated }, input: { workspaceId: input.workspaceId,
    identity: login.identity, startedAt: login.startedAt, connectMemberId: login.connectMemberId,
    emailProof: { challengeId: proof.challengeId, code: proof.code }, userAgent: req.get("user-agent"), ip: resolveClientIp(req) } });
  if (linked.kind !== "signed_in") return { kind: linked.kind };
  return {
    kind: "signed_in",
    sessionCookie: () => memberSessionCookie({ rawToken: linked.result.rawSessionToken, expiresAtIso: linked.result.session.expiresAt }),
    announce: () => captureMemberSignedIn({ deps: deps.members, request: req, result: linked.result, method: "oidc", workspaceId: deps.members.workspaceId }),
    member: () => toPublicMemberResponse(linked.result.member),
  };
}

/** The app view the proof spec is mounted on: the no-store/no-referrer headers, the failed-sign-in observer, then
 * `checkMemberPost` (workspace 404, same-origin 403, 4 KiB post-parse 413) on the Express request, in the
 * hand-written order.
 * @returns An `app` whose `post` still makes ONE `app.post(path, handler)` registration (route table unchanged).
 * @complexity O(1) setup; per request as `checkMemberPost`.
 */
function memberOidcProofPostApp({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): Express {
  const view: Express = Object.create(app);
  const post = (path: string, handler: RequestHandler) => app.post(path, (req, res, next) => {
    memberOidcHeaders({ res });
    observeMemberSignInFailure({ deps, request: req, response: res, method: "oidc" });
    if (!checkMemberPost({ req, res, deps })) return;
    return handler(req, res, next);
  });
  view.post = post as unknown as Express["post"];
  return view;
}

const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

/** Browser-bound emailed-code continuation. A wrong code retains its challenge attempt budget
 * in S2, and keeps this cookie for a bounded retry; success clears it. No identity comes from JSON.
 * Mounts the Jini spec; the counter is read per request, as the hand-written route did. O(1) setup.
 */
export function registerMemberOidcVerifyEmailRoute({ app, deps }: { app: Express; deps: MemberOidcRouteDeps }, _options = {}): void {
  const mounted: MemberOidcVerifyEmailRouteDeps = {
    ipLimiter: { check: (input) => deps.members.magicLinkCompleteAttemptLimiter.check(input) },
    parseProof: ({ body }) => proofBody({ body }),
    flowCookie: (input) => memberOidcCookieHeader(input),
    signedInLocation: "/account",
    refusalFor: ({ error }) => memberOidcRefusal({ error }),
    verify: boundPerRequest, callbackUrl: boundPerRequest,
  };
  mountPublicRawRoute({
    app: memberOidcProofPostApp({ app, deps: deps.members }),
    spec: memberOidcVerifyEmailRoute,
    deps: mounted,
    failure: MEMBER_AUTH_FAILURE,
    workspaceId: deps.members.workspaceId,
  }, {
    requestDeps: ({ req, deps: base }) => ({
      ...base,
      verify: ({ proof }) => verifyEmailProof({ req, deps, proof }),
      callbackUrl: () => callbackAddress({ req, deps }),
    }),
  });
}
