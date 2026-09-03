import type { Express, Response } from "express";

import { completeSignIn, MemberAuthError, MemberNotFoundError } from "#src/features/members/index";
import { toPublicMemberResponse } from "../../http/members.js";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";

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

function setMemberSessionCookie(res: Response, rawToken: string, expiresAtIso: string): void {
  const maxAgeSeconds = Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000));
  res.setHeader(
    "Set-Cookie",
    `${MEMBER_SESSION_COOKIE}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax; Secure`
  );
}

/** Enforces `MAGIC_LINK_COMPLETE_ATTEMPT` on this public route. Writes the 429 itself and returns
 *  whether the caller should proceed. @complexity O(1). */
function checkCompleteSignInRateLimit(deps: MemberPublicRouteDeps, clientIp: string, res: Response): boolean {
  const rateLimitResult = deps.magicLinkCompleteAttemptLimiter.check(clientIp);
  if (rateLimitResult.allowed) return true;
  res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
  res.status(429).json({
    error: "too many sign-in completion attempts from this address",
    code: "RATE_LIMIT_EXCEEDED",
    details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
  });
  return false;
}

/** Maps this route's thrown error types onto the public error envelope. @complexity O(1). */
function sendCompleteSignInError(res: Response, err: unknown): void {
  if (err instanceof MemberAuthError) {
    res.status(401).json({ error: err.message, code: "MEMBER_AUTH_ERROR" });
    return;
  }
  if (err instanceof MemberNotFoundError) {
    res.status(404).json({ error: err.message, code: "MEMBER_NOT_FOUND" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * @file `POST /api/members/v1/workspaces/:workspaceId/sign-in/complete` — the
 * new PUBLIC complete-sign-in route (ADR-PIPE-013 Decision §2-3, C-013).
 *
 * Purpose:
 * `completeSignIn` (`src/members/write-service.ts`) has existed since ADR-030
 * but had zero HTTP callers anywhere in this codebase — this route is that
 * caller. Deliberately unauthenticated (no `requireAdminSession`, no
 * `authorize()`) and gated by the lighter `MAGIC_LINK_COMPLETE_ATTEMPT`
 * profile (defense-in-depth only — the 256-bit raw token makes brute force
 * computationally infeasible regardless, per ADR-PIPE-013 Decision §2-3).
 *
 * INV-NEW-01 (cookie isolation): sets ONLY `tovu_member_session`, never reads
 * or writes `tovu_session` (the admin cookie) — a request carrying only a
 * `tovu_session` cookie (no token) is still treated as anonymous/rejected by
 * this route; the admin cookie has zero effect here.
 */
export function registerPublicMemberCompleteSignInRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/sign-in/complete", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const clientIp = resolveClientIp(req);
    if (!checkCompleteSignInRateLimit(deps, clientIp, res)) {
      return;
    }

    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await completeSignIn({
        deps: toPublicMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          token: String(body.token ?? ""),
          userAgent: req.get("user-agent") ?? undefined,
          ip: clientIp,
        },
      });

      setMemberSessionCookie(res, result.rawSessionToken, result.session.expiresAt);
      res.json({ member: toPublicMemberResponse(result.member) });
    } catch (err) {
      sendCompleteSignInError(res, err);
    }
  });
}
