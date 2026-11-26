import { failureReporterOf, reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";
import { serialize } from "cookie";
import { memberAuthRefusal, memberCookieExpiry, sendMemberAuthError as sendAuthError } from "@jini-ai/user-management/members/public-member-auth-response";
import { MEMBER_SESSION_COOKIE } from "../../http/members.js";

/**
 * @file Tovu's member session cookie (name, attributes, setter, clearer) and credential refusal copy, shared by
 * the PUBLIC member routes. The complete-sign-in route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/complete-sign-in`, mounted by `registerPublicMemberCompleteSignInRoute`
 * (`runtime/composition/modules/public-members.ts`); it sets ONLY `tovu_member_session`, never `tovu_session`.
 */

/**
 * ADR-030 §3: a DISTINCT cookie name from the admin `tovu_session` (which
 * lives in `inbound/admin-http/dev-auth.ts` and is never read/written here — see
 * ADR-PIPE-013 INV-NEW-01 / Enforcement, "no route in either family may read
 * the other's cookie"). `SameSite=Lax`, not `Strict`: the member arrives via
 * a top-level navigation from an email client, exactly the case
 * `SameSite=Strict` would break.
 *
 * Exported (2026-09-02 member-gating dispatch) so the public site's read-path gate
 * (`routes/site/pages.ts`) reads the SAME literal this route sets, rather than a second
 * hand-copied string that could silently drift from it.
 */
const MEMBER_COOKIE_OPTIONS = { httpOnly: true, path: "/", sameSite: "lax", secure: true } as const;

/** The sole member cookie setter, shared by password and challenge completion. O(1). */
export function setMemberSessionCookie({ res, rawToken, expiresAtIso }: {
  res: Response; rawToken: string; expiresAtIso: string;
}, _options = {}): void {
  res.append("Set-Cookie", memberSessionCookie({ rawToken, expiresAtIso }));
}

/** The member session `Set-Cookie` value, exactly as Express 4's
 *  `res.cookie(MEMBER_SESSION_COOKIE, rawToken, { ...MEMBER_COOKIE_OPTIONS, maxAge })` serialized it: `maxAge` ms
 *  until the session expiry (never negative), written as whole-second `Max-Age` and `Expires` at now + `maxAge`.
 *  Shared by the hand-written challenge completion and the password sign-in spec's injected cookie. O(1).
 */
export function memberSessionCookie({ rawToken, expiresAtIso }: { rawToken: string; expiresAtIso: string }, _options: Record<string, never> = {}): string {
  const { expires, maxAge } = memberCookieExpiry({ expiresAtIso, nowMs: Date.now });
  return serialize(MEMBER_SESSION_COOKIE, rawToken, { ...MEMBER_COOKIE_OPTIONS, expires, maxAge });
}

/** Clear exactly the attributes used to set the cookie, so sign-out removes it reliably. O(1).
 * @returns The `Set-Cookie` value Express 4's `res.clearCookie(MEMBER_SESSION_COOKIE, MEMBER_COOKIE_OPTIONS)`
 *   wrote: an empty value expiring at the epoch (`expires: new Date(1)`), the same name and attributes.
 */
export function clearedMemberSessionCookie(_optional: Record<string, never> = {}): string {
  return serialize(MEMBER_SESSION_COOKIE, "", { ...MEMBER_COOKIE_OPTIONS, expires: new Date(1) });
}

/** The public member routes' unexpected-failure copy (`reportServerFailure` operation + visitor sentence). */
export const MEMBER_AUTH_FAILURE = {
  operation: "public:member-auth",
  visitorError: "The site couldn’t complete sign-in. Try the original action again and report this error ID if it keeps happening.",
} as const;

/** Write `memberAuthRefusal`'s answer, or report the failure and answer the redacted 500. */
export const sendMemberAuthError = ({ res, error }: { res: Response; error: unknown }, options: { reset?: boolean } = {}): void => sendAuthError({ error, deps: {
  refusal: memberAuthRefusal,
  report: input => reportServerFailure(input, { reporter: failureReporterOf({ res }) }),
  json: (body, status) => { res.status(status).json(body); },
  copy: MEMBER_AUTH_FAILURE,
} }, options);
