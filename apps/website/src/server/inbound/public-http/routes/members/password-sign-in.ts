import type { Express } from "express";
import { signInWithPassword } from "#src/features/members/index";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { toPublicMemberResponse } from "../../http/members.js";
import { checkMemberPost, checkMemberRequestLimits, memberStringBody, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";
import { sendMemberAuthError, setMemberSessionCookie } from "./complete-sign-in.js";

/** Verify unchanged password bytes behind separate strict IP and normalized-email counters. O(1) I/O. */
export function registerPublicMemberPasswordSignInRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/password/sign-in", async (req, res) => {
    try {
      if (!checkMemberPost({ req, res, deps })) return;
      const body = memberStringBody({ body: req.body, kind: "passwordSignIn" });
      if (!body) { res.status(400).json({ error: "expected email and password strings" }); return; }
      if (!await checkMemberRequestLimits({ req, res, deps, email: body.email,
        emailLimiter: deps.passwordSignInPerEmailLimiter, ipLimiter: deps.passwordSignInPerIpLimiter })) return;
      const result = await signInWithPassword({ deps: toPublicMembersWriteServiceDeps(deps), input: {
        workspaceId: deps.workspaceId, email: body.email, password: body.password,
        userAgent: req.get("user-agent"), ip: resolveClientIp(req),
      } });
      setMemberSessionCookie({ res, rawToken: result.rawSessionToken, expiresAtIso: result.session.expiresAt });
      res.json({ member: toPublicMemberResponse(result.member) });
    } catch (error) { sendMemberAuthError({ res, error }); }
  });
}
