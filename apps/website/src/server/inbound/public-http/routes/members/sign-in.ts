import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { observeMemberSignInFailure } from "./analytics.js";
import { captureVisitorEvent } from "../../visitor-analytics.js";
import type { Express, Response } from "express";
import { SenderIdentityNotConfiguredError } from "#src/platform/mail/index";
import { MemberAuthError, MemberSignInUnavailableError, MemberValidationError } from "@jini-ai/user-management/members/types";
import { prepareMemberChallenge } from "@jini-ai/user-management/members/member-challenge-request";
import { memberAuthRefusal } from "./complete-sign-in.js";
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
export function registerPublicMemberSignInRequestRoute({ app, deps }: { app: Express; deps: MemberPublicRouteDeps }, _optional: Record<string, never> = {}): void {
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
      setImmediate(() => { void prepared.deliver().catch((error: unknown) => reportMemberDeliveryFailure({ error })); });
    } catch (error) { respondToSignInError({ error, res }); }
  });
}

/** Detached failures remain observable through private, redacted diagnostics after acceptance. */
export function reportMemberDeliveryFailure({ error }: { error: unknown }, _optional = {}): void {
  reportServerFailure({ error, operation: "public:member-delivery" });
}

/** Setup errors are site-wide; validation is independent of account existence.
 * Per-address delivery outcomes never enter this error path: they use generic acceptance.
 * @complexity O(1); writes one response, without logging credentials or provider detail.
 */
export function respondToSignInError({ error, res }: { error: unknown; res: Response }, _options = {}): void {
  const refusal = memberSignInRefusal({ error });
  if (refusal) { res.status(refusal.status).json(refusal.body); return; }
  const { errorId } = reportServerFailure({ error, operation: MEMBER_SIGN_IN_FAILURE.operation }, { tracker: res.locals.adminFailureTracker });
  res.status(500).json({ error: MEMBER_SIGN_IN_FAILURE.visitorError, errorId });
}

/** The sign-in request routes' unexpected-failure copy (`reportServerFailure` operation + visitor sentence). */
export const MEMBER_SIGN_IN_FAILURE = {
  operation: "public:member-sign-in",
  visitorError: "The site couldn’t complete sign-in. Try the original action again and report this error ID if it keeps happening.",
} as const;

/** `respondToSignInError`'s known answers: credential 401, site-wide setup 503, validation 400.
 * @returns The refusal (status + flat body), or `undefined` for an unexpected error (the 500).
 */
export function memberSignInRefusal({ error }: { error: unknown }, _options = {}): { status: number; body: { error: string; code?: string } } | undefined {
  if (error instanceof MemberAuthError) return memberAuthRefusal({ error });
  if (error instanceof MemberSignInUnavailableError || error instanceof SenderIdentityNotConfiguredError) {
    return { status: 503, body: { error: error instanceof SenderIdentityNotConfiguredError
      ? "Member sign-in is unavailable: email is not set up for this site." : error.message, code: "MEMBER_SIGN_IN_UNAVAILABLE" } };
  }
  if (error instanceof MemberValidationError) return { status: 400, body: { error: error.message } };
  return undefined;
}
