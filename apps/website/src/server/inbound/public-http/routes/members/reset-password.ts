import type { Express } from "express";
import { resetPassword } from "#src/features/members/index";
import { checkMemberPost, checkMemberRequestLimits, memberStringBody, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";
import { sendMemberAuthError } from "./complete-sign-in.js";

/** Consume a link-only reset; policy belongs to the service and a reset never creates a session. */
export function registerPublicMemberResetPasswordRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/reset-password", async (req, res) => {
    try {
      if (!checkMemberPost({ req, res, deps })) return;
      const body = memberStringBody({ body: req.body, kind: "resetPassword" });
      if (!body?.token) { res.status(400).json({ error: "expected nonempty token and password strings" }); return; }
      if (!await checkMemberRequestLimits({ req, res, deps, ipLimiter: deps.magicLinkCompleteAttemptLimiter })) return;
      res.json(await resetPassword({ deps: toPublicMembersWriteServiceDeps(deps),
        input: { workspaceId: deps.workspaceId, token: body.token, password: body.password } }));
    } catch (error) { sendMemberAuthError({ res, error }, { reset: true }); }
  });
}
