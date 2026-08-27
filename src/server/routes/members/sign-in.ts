import type { Express } from "express";

import { MemberValidationError, requestSignInLink } from "#src/features/members/index";
import { resolveClientIp } from "#src/core/rate-limit/rate-limit";
import type { RateLimitResult } from "#src/core/rate-limit/rate-limit";
import { toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";

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

/**
 * Finds the first exceeded check among a set of named rate-limit results, or `null` if every
 * check passed. Isolated from `RateLimitResult`'s own discriminated union so the caller gets a
 * flat, always-present `retryAfterSeconds` on the exceeded case (an `Array.find` predicate does
 * NOT narrow the element type it returns, so this has to be a plain loop to keep that field
 * type-checked instead of hand-waved).
 *
 * @complexity O(n) over `checks`; n is fixed at 2 call sites today (email, IP).
 */
function findExceededRateLimit(
  checks: ReadonlyArray<{ result: RateLimitResult; message: string }>,
): { message: string; retryAfterSeconds: number } | null {
  for (const check of checks) {
    if (!check.result.allowed) {
      return { message: check.message, retryAfterSeconds: check.result.retryAfterSeconds };
    }
  }
  return null;
}

export function registerPublicMemberSignInRequestRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/sign-in", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = String(body.email ?? "");
    const emailKey = email.trim().toLowerCase();
    const clientIp = resolveClientIp(req);

    // Both checks must pass before `requestSignInLink` runs (W-002/W-003) —
    // neither check is skipped, and both consult a shared, app-boot-scoped
    // limiter instance (C-015), not a per-request one.
    const exceeded = findExceededRateLimit([
      { result: deps.magicLinkPerEmailLimiter.check(emailKey), message: "too many sign-in requests for this email" },
      { result: deps.magicLinkPerIpLimiter.check(clientIp), message: "too many sign-in requests from this address" },
    ]);
    if (exceeded) {
      res.setHeader("Retry-After", String(exceeded.retryAfterSeconds));
      res.status(429).json({
        error: exceeded.message,
        code: "RATE_LIMIT_EXCEEDED",
        details: { retryAfterSeconds: exceeded.retryAfterSeconds },
      });
      return;
    }

    try {
      const result = await requestSignInLink({
        deps: toPublicMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          email,
          redirectPath: body.redirectPath ? String(body.redirectPath) : undefined,
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
