import type { Express, Response } from "express";
import { completeSignIn, MemberAuthError, MemberReauthenticationRequiredError, MemberValidationError, type MemberSignInInput } from "#src/features/members/index";
import { toPublicMemberResponse } from "../../http/members.js";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { checkMemberPost, checkMemberRequestLimits, memberStringBody, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";

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
export const MEMBER_SESSION_COOKIE = "tovu_member_session";
const MEMBER_COOKIE_OPTIONS = { httpOnly: true, path: "/", sameSite: "lax", secure: true } as const;

/** The sole member cookie setter, shared by password and challenge completion. O(1). */
export function setMemberSessionCookie({ res, rawToken, expiresAtIso }: {
  res: Response; rawToken: string; expiresAtIso: string;
}, _options = {}): void {
  const maxAge = Math.max(0, new Date(expiresAtIso).getTime() - Date.now());
  res.cookie(MEMBER_SESSION_COOKIE, rawToken, { ...MEMBER_COOKIE_OPTIONS, maxAge });
}

/** Clear exactly the attributes used to set the cookie, so sign-out removes it reliably. O(1). */
export function clearMemberSessionCookie({ res }: { res: Response }, _options = {}): void {
  res.clearCookie(MEMBER_SESSION_COOKIE, MEMBER_COOKIE_OPTIONS);
}

/** Credential failures share one body across password, link, code and reset; no exception text leaks. */
export function sendMemberAuthError({ res, error }: { res: Response; error: unknown }, options: { reset?: boolean } = {}): void {
  if (error instanceof MemberReauthenticationRequiredError) {
    res.status(401).json({ error: "sign in again to set a password", code: "REAUTHENTICATION_REQUIRED" });
    return;
  }
  if (error instanceof MemberAuthError) {
    res.status(401).json({ error: "invalid credentials", code: "INVALID_CREDENTIALS" });
    return;
  }
  if (options.reset && error instanceof MemberValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/** Exactly one credential form, with no missing/empty handle passed to the repository. O(1). */
export function completionCredential({ body, workspaceId }: { body: unknown; workspaceId: string }, _options = {}): MemberSignInInput | null {
  const token = memberStringBody({ body, kind: "token" });
  if (token?.token) return { workspaceId, token: token.token };
  const code = memberStringBody({ body, kind: "code" });
  if (code?.challengeId && /^\d{6}$/.test(code.code)) return { workspaceId, challengeId: code.challengeId, code: code.code };
  return null;
}

/**
 * @file `POST /api/members/v1/workspaces/:workspaceId/sign-in/complete` — the PUBLIC
 * complete-sign-in route (ADR-PIPE-013 Decision §2-3, C-013).
 *
 * Deliberately unauthenticated (no `requireAdminSession`, no `authorize()`) and gated by the
 * lighter `MAGIC_LINK_COMPLETE_ATTEMPT` per-IP profile. That limit is defense-in-depth: the
 * 256-bit raw link token makes brute force infeasible, and a six-digit code is bounded by the
 * per-challenge attempt reservation in `consumeMemberChallenge`, not by this IP counter.
 *
 * INV-NEW-01 (cookie isolation): sets ONLY `tovu_member_session`, never reads or writes
 * `tovu_session` (the admin cookie) — a request carrying only a `tovu_session` cookie (no token)
 * is still rejected by this route; the admin cookie has zero effect here.
 */

/** Complete a purpose-bound link/code challenge and set only the member session cookie. O(1) I/O. */
export function registerPublicMemberCompleteSignInRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/sign-in/complete", async (req, res) => {
    try {
      if (!checkMemberPost({ req, res, deps })) return;
      const credential = completionCredential({ body: req.body, workspaceId: deps.workspaceId });
      if (!credential) { res.status(400).json({ error: "expected token or challengeId and six-digit code strings" }); return; }
      if (!await checkMemberRequestLimits({ req, res, deps, ipLimiter: deps.magicLinkCompleteAttemptLimiter })) return;
      const result = await completeSignIn({ deps: toPublicMembersWriteServiceDeps(deps),
        input: { ...credential, userAgent: req.get("user-agent"), ip: resolveClientIp(req) } });
      setMemberSessionCookie({ res, rawToken: result.rawSessionToken, expiresAtIso: result.session.expiresAt });
      res.json({ member: toPublicMemberResponse(result.member) });
    } catch (error) { sendMemberAuthError({ res, error }); }
  });
}
