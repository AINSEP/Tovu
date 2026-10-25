/** HTTP-only member-login dependencies. No staff cookie or authorization capability crosses here. */
import type { Request, Response } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { parse } from "cookie";
import { MemberLoginError, type LoginProvider, type OidcLoginDeps, type LoginContext,
  type MemberLoginLinkDeps } from "#src/features/member-login/index";
import { resolveMemberSession, type MemberSessionRecord, type MemberRecord } from "#src/features/members/index";
import type { MemberPublicRouteDeps } from "./deps.js";
import { MEMBER_SESSION_COOKIE } from "./complete-sign-in.js";

export interface MemberOidcRouteDeps {
  members: MemberPublicRouteDeps;
  protocol: OidcLoginDeps;
  links: MemberLoginLinkDeps;
  /** Fresh bundled admission plus configured credential-card metadata, never secrets. */
  listProviders: (input: { workspaceId: string }) => Promise<readonly LoginProvider[]>;
}

export const MEMBER_OIDC_PATH = "/api/members/v1/workspaces/:workspaceId/oidc/:providerId";
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

/** Never cache callbacks, continuations, identity lists or their failures. O(1). */
export function memberOidcHeaders({ res }: { res: Response }, _options = {}): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

/** Fail closed with a fixed outcome; upstream errors may contain OAuth credentials. O(1). */
export function sendMemberOidcError({ res, error }: { res: Response; error: unknown }, _options = {}): void {
  const code = error instanceof MemberLoginError ? error.code : "LOGIN_INVALID";
  res.status(code === "LOGIN_UNAVAILABLE" ? 503 : 401).json({ error: "member login failed", code });
}

/** The person pressed Cancel at the provider (`error=access_denied`): its own page message. */
export class MemberOidcCancelled extends Error {}

/** Start and callback are top-level browser pages, not fetches, so a failure goes back to /signin
 * with one fixed code in the fragment (never the query: no Referer/log copy) for the page script
 * to show in plain words. Same fixed codes as the JSON routes; nothing upstream is echoed. O(1).
 */
export function redirectMemberOidcError({ res, error }: { res: Response; error: unknown }, _options = {}): void {
  let code = error instanceof MemberLoginError ? error.code : "LOGIN_INVALID";
  if (error instanceof MemberOidcCancelled) code = "LOGIN_CANCELLED";
  res.redirect(303, `/signin#oidcError=${code}`);
}

/** Revalidate the presenting member on every leg. Only this member session can establish a
 * connect intent. A stale (expired/revoked) cookie grants nothing, so it reads as anonymous:
 * refusing it would lock that browser out of Google sign-in after a sign-out elsewhere, and a
 * connect whose session went stale mid-flow still fails, because the sealed ownerKey differs.
 * O(1) indexed reads.
 */
export async function currentOidcMember(required: { req: Request; deps: MemberPublicRouteDeps }, _options = {}):
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
