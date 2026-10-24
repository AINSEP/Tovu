import type { Express } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { createMemberAccessResolver } from "#src/features/members/index";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { toPublicMemberResponse } from "../../http/members.js";
import { checkMemberWorkspace, type MemberPublicRouteDeps } from "./deps.js";
import { sendMemberAuthError, MEMBER_SESSION_COOKIE } from "./complete-sign-in.js";

/** Never cache identity; resolver validates sessions, then the member row enforces current status. */
export function registerPublicMemberMeRoute(app: Express, deps: MemberPublicRouteDeps): void {
  const resolver = createMemberAccessResolver({ deps });
  app.get("/api/members/v1/workspaces/:workspaceId/me", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (!checkMemberWorkspace({ req, res, deps })) return;
      const context = await resolver.resolveContext({ workspaceId: deps.workspaceId, nowIso: nowIso({ clock: deps.clock }),
        sessionToken: readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE }) });
      const member = context.memberId ? await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: context.memberId }) : null;
      res.json({ member: member && (member.status === "active" || member.status === "pending") ? toPublicMemberResponse(member) : null });
    } catch (error) { sendMemberAuthError({ res, error }); }
  });
}
