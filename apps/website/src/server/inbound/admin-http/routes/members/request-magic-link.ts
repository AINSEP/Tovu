import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { SenderIdentityNotConfiguredError } from "#src/platform/mail/index";
import type { Response } from "express";

import { MemberSignInUnavailableError, MemberValidationError } from "@jini-ai/user-management/members/types";
import { requestSignInLink } from "#src/features/members/member-challenge-request";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toMembersWriteServiceDeps, type MembersRouteDeps } from "./deps.js";

/**
 * Parses the body and checks the per-email rate limit — ADR-PIPE-013 Decision §2-3 / INV-NEW-03:
 * the shared MAGIC_LINK_PER_EMAIL limiter (same instance the public sign-in route consults, C-015),
 * which the caller must only invoke strictly AFTER `authorize()` succeeds (an unauthorized caller
 * must never reach, and therefore never consume, this check). Writes the 429 response itself on a
 * denial and returns `null`, so the caller can `return` without re-branching.
 *
 * @complexity O(1).
 */
async function parseMagicLinkRequest({ deps, res, rawBody }: { deps: Pick<MembersRouteDeps, "magicLinkPerEmailLimiter">; res: Response; rawBody: unknown }, _optional = {}): Promise<{ rawEmail: string; redirectPath: string | undefined } | null> {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const rawEmail = String(body.email ?? "");
  const emailKey = rawEmail.trim().toLowerCase();
  // Empty emails are validation errors, never missing-key limiter buckets.
  if (!emailKey) throw new MemberValidationError(`'${rawEmail}' is not a valid email address`);
  const rateLimitResult = await deps.magicLinkPerEmailLimiter.check({ key: emailKey });
  if (!rateLimitResult.allowed) {
    res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
    res.status(429).json({
      error: "too many sign-in requests for this email",
      code: "RATE_LIMIT_EXCEEDED",
      details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
    });
    return null;
  }
  return { rawEmail, redirectPath: body.redirectPath ? String(body.redirectPath) : undefined };
}

/**
 * POST request a passwordless sign-in link for a member email (operator-
 * triggered resend, e.g. from an admin member-detail screen's "resend
 * sign-in link" action).
 *
 * Returns actual mailer acceptance to the authorized operator, including false for skipped or
 * failed sends. Site-wide setup failures return 503. Public callers use the separate generic
 * accepted response so neither membership nor per-address delivery failures can be enumerated.
 * A malformed email reaches the 400 branch below.
 *
 * ADR-PIPE-013 §1 (FEAT-013 Phase 1): previously ran behind session auth only
 * — no per-action `authorize()` call, unlike `disable.ts`. Closes that live
 * authorization gap by requiring `member.manage`, copying `disable.ts`'s
 * exact call shape. INV-NEW-03 (Phase 2, T022, now enforced below):
 * the shared `MAGIC_LINK_PER_EMAIL` rate-limit check must land strictly
 * *after* this `authorize()` call, never before, so an unauthorized caller
 * cannot consume rate-limit budget for a target email as a side channel.
 */
export const registerAdminMemberRequestMagicLinkRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as MembersRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/members/request-magic-link", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);

      const params = { principalId: principal.id, permission: "member.manage", workspaceId: deps.workspaceId, entityType: "member" };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const parsed = await parseMagicLinkRequest({ deps, res, rawBody: req.body });
      if (!parsed) {
        return;
      }

      const result = await requestSignInLink({
        deps: toMembersWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          email: parsed.rawEmail,
          redirectPath: parsed.redirectPath,
        },
      });

      res.json(result);
    } catch (err) {
      sendMagicLinkError({ res, err });
    }
  });
};

function sendMagicLinkError({ res, err }: { res: Response; err: unknown }, _optional = {}): void {
  if (err instanceof MemberSignInUnavailableError || err instanceof SenderIdentityNotConfiguredError) {
    res.status(503).json({ error: err instanceof SenderIdentityNotConfiguredError ? "Member sign-in is unavailable: email is not set up for this site." : err.message, code: "MEMBER_SIGN_IN_UNAVAILABLE" });
    return;
  }
  if (err instanceof MemberValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  sendAdminFailure({ res, error: err }, { operation: "routes/members/request-magic-link", code: "INTERNAL_ERROR" });
}
