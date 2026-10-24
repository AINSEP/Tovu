import type { Express } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { NodeSessionTokens } from "@jini-ai/user-management/server";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { checkMemberPost, type MemberPublicRouteDeps } from "./deps.js";
import { sendMemberAuthError, clearMemberSessionCookie, MEMBER_SESSION_COOKIE } from "./complete-sign-in.js";

/** Revoke only the member session; an absent/already-revoked cookie still succeeds. O(1) I/O. */
export function registerPublicMemberSignOutRoute(app: Express, deps: MemberPublicRouteDeps): void {
  const tokens = new NodeSessionTokens({});
  app.post("/api/members/v1/workspaces/:workspaceId/sign-out", async (req, res) => {
    try {
      if (!checkMemberPost({ req, res, deps })) return;
      const rawToken = readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE });
      const session = rawToken ? await deps.memberSessionRepo.findByTokenHash({ workspaceId: deps.workspaceId,
        tokenHash: tokens.hashToken({ rawToken }) }) : null;
      if (session && !session.revokedAt) await deps.memberSessionRepo.revoke({ workspaceId: deps.workspaceId,
        id: session.id, revokedAt: nowIso({ clock: deps.clock }) });
      clearMemberSessionCookie({ res });
      res.status(204).end();
    } catch (error) { sendMemberAuthError({ res, error }); }
  });
}
