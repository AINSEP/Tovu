import type { Express } from "express";

import { MemberValidationError, requestSignInLink } from "#src/members/index";
import { resolveClientIp } from "../../middleware/rate-limit";
import { toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps";

/**
 * @file `POST /api/members/v1/workspaces/:workspaceId/sign-in` — the new
 * PUBLIC, visitor-initiated sign-in-request route (ADR-PIPE-013 Decision §2-3,
 * C-012).
 *
 * Purpose:
 * The route this remediation adds so a real visitor can originate a sign-in
 * request at all — before this, the only caller of `requestSignInLink` was
 * the operator-triggered admin resend action. Deliberately unauthenticated
 * (no `requireAdminSession`, no `authorize()` — this route family must never
 * import either, see ADR-PIPE-013 Enforcement) and rate-limited on BOTH axes
 * before any token is minted:
 *  - `MAGIC_LINK_PER_EMAIL` (keyed by the normalized target email) — bounds
 *    spam to one inbox regardless of source IP.
 *  - `MAGIC_LINK_PER_IP` (keyed by `resolveClientIp`) — bounds a single
 *    attacker's ability to enumerate many emails.
 * Both checks must pass (W-002/W-003) — this is the primary target of ADR-030
 * OQ-8's hard pre-launch precondition; checking only one of the two would
 * reopen the enumeration/abuse surface. INV-06 (anti-enumeration) is
 * preserved unchanged: `requestSignInLink` itself already returns the same
 * `{delivered:true}` shape regardless of whether the email is registered; a
 * `429` here is a volume signal (this email/IP was queried too often), never
 * an existence signal.
 */
export function registerPublicMemberSignInRequestRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/sign-in", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const email = String(req.body?.email ?? "");
    const emailKey = email.trim().toLowerCase();
    const clientIp = resolveClientIp(req);

    // Both checks must pass before `requestSignInLink` runs (W-002/W-003) —
    // neither check is skipped, and both consult a shared, app-boot-scoped
    // limiter instance (C-015), not a per-request one.
    const emailLimitResult = deps.magicLinkPerEmailLimiter.check(emailKey);
    if (!emailLimitResult.allowed) {
      res.setHeader("Retry-After", String(emailLimitResult.retryAfterSeconds));
      res.status(429).json({
        error: "too many sign-in requests for this email",
        code: "RATE_LIMIT_EXCEEDED",
        details: { retryAfterSeconds: emailLimitResult.retryAfterSeconds },
      });
      return;
    }

    const ipLimitResult = deps.magicLinkPerIpLimiter.check(clientIp);
    if (!ipLimitResult.allowed) {
      res.setHeader("Retry-After", String(ipLimitResult.retryAfterSeconds));
      res.status(429).json({
        error: "too many sign-in requests from this address",
        code: "RATE_LIMIT_EXCEEDED",
        details: { retryAfterSeconds: ipLimitResult.retryAfterSeconds },
      });
      return;
    }

    try {
      const result = await requestSignInLink({
        deps: toPublicMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          email,
          redirectPath: req.body?.redirectPath ? String(req.body.redirectPath) : undefined,
        },
      });

      res.json(result);
    } catch (err) {
      if (err instanceof MemberValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
}
