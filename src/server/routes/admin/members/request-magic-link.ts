import { MemberValidationError, requestSignInLink } from "../../../../members";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";
import { toMembersWriteServiceDeps, type MembersRouteDeps } from "./deps";

/**
 * POST request a passwordless sign-in link for a member email (operator-
 * triggered resend, e.g. from an admin member-detail screen's "resend
 * sign-in link" action).
 *
 * Always resolves `{ delivered: true }` for a syntactically valid email — the
 * write-service's constant-response anti-enumeration behavior (ADR-030 OQ-8:
 * a distinguishable response would let a caller probe which emails are
 * registered) is preserved end-to-end. A malformed email is the only path
 * that reaches the 400 branch below.
 *
 * ADR-PIPE-013 §1 (FEAT-013 Phase 1): previously ran behind session auth only
 * — no per-action `authorize()` call, unlike `disable.ts`. Closes that live
 * authorization gap by requiring `member.manage`, copying `disable.ts`'s
 * exact call shape. INV-NEW-03 (Phase 2, T022 — not yet implemented here):
 * the shared `MAGIC_LINK_PER_EMAIL` rate-limit check must land strictly
 * *after* this `authorize()` call, never before, so an unauthorized caller
 * cannot consume rate-limit budget for a target email as a side channel.
 */
export const registerAdminMemberRequestMagicLinkRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/members/request-magic-link", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "member.manage",
        workspaceId: deps.workspaceId,
        entityType: "member",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'member.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "member.manage", reason: authResult.reason },
        });
        return;
      }

      // ADR-PIPE-013 Decision §2-3 / INV-NEW-03: the shared MAGIC_LINK_PER_EMAIL
      // limiter (same instance the public sign-in route consults, C-015),
      // strictly AFTER authorize() — an unauthorized caller must never reach
      // (and therefore never consume) this check.
      const emailKey = String(req.body?.email ?? "").trim().toLowerCase();
      const rateLimitResult = deps.magicLinkPerEmailLimiter.check(emailKey);
      if (!rateLimitResult.allowed) {
        res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
        res.status(429).json({
          error: "too many sign-in requests for this email",
          code: "RATE_LIMIT_EXCEEDED",
          details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
        });
        return;
      }

      const result = await requestSignInLink({
        deps: toMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          email: String(req.body?.email ?? ""),
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
};
