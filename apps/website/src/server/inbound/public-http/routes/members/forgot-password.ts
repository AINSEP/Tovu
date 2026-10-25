import type { Express } from "express";
import { prepareMemberChallenge } from "#src/features/members/index";
import { checkMemberPost, checkMemberRequestLimits, memberStringBody, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";
import { reportMemberDeliveryFailure, respondToSignInError } from "./sign-in.js";

/** Link-only reset requests share the magic-link counters and detached delivery owner. O(1) setup I/O. */
export function registerPublicMemberForgotPasswordRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/forgot-password", async (req, res) => {
    try {
      if (!checkMemberPost({ req, res, deps })) return;
      const body = memberStringBody({ body: req.body, kind: "forgotPassword" });
      if (!body) { res.status(400).json({ error: "expected email string" }); return; }
      if (!await checkMemberRequestLimits({ req, res, deps, email: body.email,
        emailLimiter: deps.magicLinkPerEmailLimiter, ipLimiter: deps.magicLinkPerIpLimiter })) return;
      const prepared = await prepareMemberChallenge({ deps: toPublicMembersWriteServiceDeps(deps), purpose: "password_reset",
        input: { workspaceId: deps.workspaceId, email: body.email } });
      res.json({ accepted: true });
      // Per-address lookup and mail latency must never delay public acceptance.
      setImmediate(() => { void prepared.deliver().catch(reportMemberDeliveryFailure); });
    } catch (error) { respondToSignInError({ error, res }); }
  });
}
