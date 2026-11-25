/** HTTP-only member-login dependencies. No staff cookie or authorization capability crosses here. */
import type { Express, Request, RequestHandler, Response } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { parse, serialize } from "cookie";
import type { MemberLoginLinkDeps } from "@jini-ai/user-management/member-login/link-service";
import type { OidcLoginDeps, LoginContext } from "@jini-ai/user-management/member-login/oidc-login";
import { MemberLoginError, type MemberLoginOutcomeCode } from "@jini-ai/user-management/server";
import type { LoginProvider } from "@jini-ai/core/contracts/site/user-management-server";
import { resolveMemberSession } from "@jini-ai/user-management/members/access-resolver";
import { type MemberSessionRecord, type MemberRecord } from "@jini-ai/user-management/members/types";
import { checkMemberWorkspace, type MemberPublicRouteDeps } from "./deps.js";
import { observeMemberSignInFailure } from "./analytics.js";
import { MEMBER_SESSION_COOKIE } from "./complete-sign-in.js";

export interface MemberOidcRouteDeps {
  members: MemberPublicRouteDeps;
  protocol: OidcLoginDeps;
  links: MemberLoginLinkDeps;
  /** Fresh bundled admission plus configured credential-card metadata, never secrets. */
  listProviders: (input: { workspaceId: string }) => Promise<readonly LoginProvider[]>;
}

export const MEMBER_OIDC_BINDING_COOKIE = "__Secure-tovu_member_login_binding";
export const MEMBER_OIDC_PROOF_COOKIE = "__Secure-tovu_member_login_proof";
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax" as const };

/** Reject duplicate names before the shared parser can silently select one. O(h) header bytes.
 * Malformed escapes remain invalid bearer material, as in the existing member-cookie reader.
 */
export function uniqueMemberCookie(required: { req: Pick<Request, "headers">; name: string }, _options = {}): string | undefined {
  const header = required.req.headers.cookie ?? "";
  const matches = header.split(";").filter(part => part.split("=", 1)[0].trim() === required.name);
  if (matches.length > 1) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  return parse(header)[required.name];
}

/** The exact configured callback path scopes proof cookies, including a configured base path.
 * @complexity O(u) callback URL bytes; no request Host/forwarded header is used.
 */
export function memberOidcCookie(required: {
  res: Response; callbackUrl: string; kind: "callback" | "proof"; binding?: string;
}, _options = {}): void {
  const path = new URL(required.callbackUrl).pathname;
  const name = required.kind === "callback" ? MEMBER_OIDC_BINDING_COOKIE : MEMBER_OIDC_PROOF_COOKIE;
  const scope = required.kind === "callback" ? path : path.replace(/\/callback$/, "/verify-email");
  if (required.binding === undefined) { required.res.clearCookie(name, { ...COOKIE_OPTIONS, path: scope }); return; }
  if (!/^[A-Za-z0-9_-]{43}$/.test(required.binding)) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  required.res.cookie(name, required.binding, { ...COOKIE_OPTIONS, path: scope, maxAge: 600000 });
}

/** The `Set-Cookie` value {@link memberOidcCookie} writes, exactly as Express 4's `res.cookie(name, binding,
 *  { ...COOKIE_OPTIONS, path, maxAge: 600000 })` / `res.clearCookie(name, { ...COOKIE_OPTIONS, path })` serialized
 *  it: whole-second `Max-Age` with `Expires` at now + 10 minutes, or an empty value expiring at the epoch.
 * @throws {MemberLoginError} LOGIN_INVALID for a malformed binding. @complexity O(u) callback URL bytes.
 */
export function memberOidcCookieHeader(required: { callbackUrl: string; kind: "callback" | "proof"; binding?: string }, _options = {}): string {
  const path = new URL(required.callbackUrl).pathname;
  const name = required.kind === "callback" ? MEMBER_OIDC_BINDING_COOKIE : MEMBER_OIDC_PROOF_COOKIE;
  const scope = required.kind === "callback" ? path : path.replace(/\/callback$/, "/verify-email");
  if (required.binding === undefined) return serialize(name, "", { ...COOKIE_OPTIONS, path: scope, expires: new Date(1) });
  if (!/^[A-Za-z0-9_-]{43}$/.test(required.binding)) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  return serialize(name, required.binding, { ...COOKIE_OPTIONS, path: scope, expires: new Date(Date.now() + 600000), maxAge: 600 });
}

/** Start and callback (Jini specs) are GET pages mounted on this app view: the no-store/no-referrer headers, the
 * failed-sign-in observer and the workspace 404 run on the Express request first, in the hand-written order.
 * @returns An `app` whose `get` still makes ONE `app.get(path, handler)` registration (route table unchanged).
 * @complexity O(1) setup; per request O(1).
 */
export function memberOidcGetApp({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): Express {
  const view: Express = Object.create(app);
  const get = (path: string, handler: RequestHandler) => app.get(path, (req, res, next) => {
    memberOidcHeaders({ res });
    observeMemberSignInFailure({ deps, request: req, response: res, method: "oidc" });
    if (!checkMemberWorkspace({ req, res, deps })) return;
    return handler(req, res, next);
  });
  view.get = get as unknown as Express["get"];
  return view;
}

/** Never cache callbacks, continuations, identity lists or their failures. O(1). */
export function memberOidcHeaders({ res }: { res: Response }, _options = {}): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

/** Fail closed with a fixed outcome; upstream errors may contain OAuth credentials. O(1).
 * @returns The fixed refusal (status + flat body) for any error; nothing upstream is echoed.
 */
export function memberOidcRefusal({ error }: { error: unknown }, _options = {}): { status: number; body: { error: string; code: string } } {
  const code = error instanceof MemberLoginError ? error.code : "LOGIN_INVALID";
  return { status: code === "LOGIN_UNAVAILABLE" ? 503 : 401, body: { error: "member login failed", code } };
}

/** Write `memberOidcRefusal`'s answer. O(1). */
export function sendMemberOidcError({ res, error }: { res: Response; error: unknown }, _options = {}): void {
  const refusal = memberOidcRefusal({ error });
  res.status(refusal.status).json(refusal.body);
}

/** The person pressed Cancel at the provider (`error=access_denied`): its own page message. */
export class MemberOidcCancelled extends Error {}

/** Start and callback are top-level browser pages, not fetches, so a failure goes back to /signin
 * with one fixed code in the fragment (never the query: no Referer/log copy) for the page script
 * to show in plain words. Same fixed codes as the JSON routes; nothing upstream is echoed. O(1).
 */
export function memberOidcErrorLocation({ error }: { error: unknown }, _options = {}): string {
  let code: MemberLoginOutcomeCode | "LOGIN_CANCELLED" = error instanceof MemberLoginError ? error.code : "LOGIN_INVALID";
  if (error instanceof MemberOidcCancelled) code = "LOGIN_CANCELLED";
  return `/signin#oidcError=${code}`;
}

/** Revalidate the presenting member on every leg. Only this member session can establish a
 * connect intent. A stale (expired/revoked) cookie grants nothing, so it reads as anonymous:
 * refusing it would lock that browser out of Google sign-in after a sign-out elsewhere, and a
 * connect whose session went stale mid-flow still fails, because the sealed ownerKey differs.
 * O(1) indexed reads.
 */
export async function currentOidcMember(required: { req: Pick<Request, "headers">; deps: MemberPublicRouteDeps }, _options = {}):
Promise<{ session: MemberSessionRecord; member: MemberRecord } | null> {
  const { req, deps } = required;
  const token = uniqueMemberCookie({ req, name: MEMBER_SESSION_COOKIE });
  if (token === undefined) return null;
  const session = await resolveMemberSession({ sessions: deps.memberSessionRepo, workspaceId: deps.workspaceId,
    sessionToken: token, nowIso: nowIso({ clock: deps.clock }) });
  if (!session) return null;
  const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: session.memberId });
  if (!member || (member.status !== "active" && member.status !== "pending")) throw new MemberLoginError({ code: "LOGIN_BLOCKED" });
  if (member.credentialsRevokedAt && session.createdAt < member.credentialsRevokedAt) return null;
  return { session, member };
}

/** Bound the path segment before any provider lookup or cookie-scope computation. O(1). */
export function memberOidcProviderId({ req }: { req: Pick<Request, "params"> }, _options = {}): string {
  const providerId = req.params.providerId;
  if (typeof providerId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(providerId)) throw new MemberLoginError({ code: "LOGIN_INVALID" });
  return providerId;
}

/** Resolve server-controlled workspace and live member intent, never query/body claims. O(1). */
export async function memberOidcContext(required: { req: Request; deps: MemberPublicRouteDeps }, _options = {}): Promise<LoginContext> {
  const providerId = memberOidcProviderId(required);
  const current = await currentOidcMember(required);
  return { workspaceId: required.deps.workspaceId, providerId,
    ...(current ? { connectMemberId: current.member.id } : {}) };
}
