import { observeMemberSignInFailure } from "./analytics.js";
import { captureVisitorEvent } from "../../visitor-analytics.js";
import type { Express, Response } from "express";
import { SenderIdentityNotConfiguredError } from "#src/platform/mail/index";
import { MemberAuthError, MemberSignInUnavailableError, MemberValidationError, prepareMemberChallenge } from "#src/features/members/index";
import { sendMemberAuthError } from "./complete-sign-in.js";
import { checkMemberPost, checkMemberRequestLimits, memberStringBody, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";

/**
 * @file `POST /api/members/v1/workspaces/:workspaceId/sign-in` — the PUBLIC, visitor-initiated
 * sign-in-request route (ADR-PIPE-013 Decision §2-3, C-012).
 *
 * Deliberately unauthenticated (no `requireAdminSession`, no `authorize()` — this route family
 * must never import either, see ADR-PIPE-013 Enforcement) and rate-limited on BOTH axes before any
 * token is minted:
 *  - `MAGIC_LINK_PER_EMAIL` (keyed by the normalized target email) — bounds spam to one inbox
 *    regardless of source IP.
 *  - `MAGIC_LINK_PER_IP` (keyed by `resolveClientIp`) — bounds a single attacker's ability to
 *    enumerate many emails.
 * Both checks must pass (W-002/W-003) — this is the primary target of ADR-030 OQ-8's hard
 * pre-launch precondition; checking only one of the two would reopen the enumeration/abuse
 * surface. INV-06 (anti-enumeration) is preserved: the public response is
 * `{accepted:true, challengeId}` regardless of the address or mailer result; site-wide setup
 * failures are checked before member lookup; a `429` here is a volume signal (this email/IP was
 * queried too often), never an existence signal.
 */

/** Public acceptance is independent of address lookup and mail latency. Setup failures remain 503.
 * @complexity O(1) setup I/O; address-dependent work runs detached after the response.
 */
export function registerPublicMemberSignInRequestRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/sign-in", async (req, res) => {
    observeMemberSignInFailure({ deps: deps, request: req, response: res, method: "challenge" });
    try {
      if (!checkMemberPost({ req, res, deps })) return;
      const body = memberStringBody({ body: req.body, kind: "signIn" });
      if (!body) { res.status(400).json({ error: "expected email and optional redirectPath strings" }); return; }
      // Empty emails have no valid counter key; preserve the service's validation response.
      if (!body.email.trim()) { res.status(400).json({ error: `'${body.email}' is not a valid email address` }); return; }
      if (!await checkMemberRequestLimits({ req, res, deps, email: body.email,
        emailLimiter: deps.magicLinkPerEmailLimiter, ipLimiter: deps.magicLinkPerIpLimiter })) return;
      const prepared = await prepareMemberChallenge({ deps: toPublicMembersWriteServiceDeps(deps, { request: req }), purpose: "signin",
        input: { workspaceId: deps.workspaceId, email: body.email, redirectPath: body.redirectPath } });
      void captureVisitorEvent({ deps: deps, request: req, name: "member_sign_in_requested", properties: { method: "challenge", realm: "member" } });
      res.json({ accepted: true, challengeId: prepared.challengeId });
      // Do not await per-address I/O or reflect its outcome in this anti-enumeration response.
      setImmediate(() => { void prepared.deliver().catch(reportMemberDeliveryFailure); });
    } catch (error) { respondToSignInError({ error, res }); }
  });
}

/** Detached failures are observable without logging addresses, bearer tokens or provider details. */
export function reportMemberDeliveryFailure(_error: unknown): void {
  console.error("Member authentication delivery failed after acceptance");
}

/** Setup errors are site-wide; validation is independent of account existence.
 * Per-address delivery outcomes never enter this error path: they use generic acceptance.
 * @complexity O(1); writes one response, without logging credentials or provider detail.
 */
export function respondToSignInError({ error, res }: { error: unknown; res: Response }, _options = {}): void {
  if (error instanceof MemberAuthError) { sendMemberAuthError({ res, error }); return; }
  if (error instanceof MemberSignInUnavailableError || error instanceof SenderIdentityNotConfiguredError) {
    res.status(503).json({ error: error instanceof SenderIdentityNotConfiguredError
      ? "Member sign-in is unavailable: email is not set up for this site." : error.message, code: "MEMBER_SIGN_IN_UNAVAILABLE" });
    return;
  }
  if (error instanceof MemberValidationError) { res.status(400).json({ error: error.message }); return; }
  res.status(500).json({ error: "internal error" });
}
