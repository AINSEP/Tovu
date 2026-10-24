import type { Express } from "express";
import { nowIso } from "@jini-ai/core/primitives";
import { MemberAuthError, resolveMemberSession, setMemberPassword } from "#src/features/members/index";
import { readRequestCookie } from "#src/server/http/request-cookie";
import { checkMemberPost, checkMemberRequestLimits, memberStringBody, toPublicMembersWriteServiceDeps, type MemberPublicRouteDeps } from "./deps.js";
import { MEMBER_SESSION_COOKIE, sendMemberAuthError } from "./complete-sign-in.js";

/** Member self-service; share /me's session check and charge both strict counters before Argon2.
 * @complexity O(n + s) in password size n and affected sessions s; service owns the write lifecycle.
 */
export function registerPublicMemberSetPasswordRoute(app: Express, deps: MemberPublicRouteDeps): void {
  app.post("/api/members/v1/workspaces/:workspaceId/password/set", async (req, res) => {
    try {
      if (!checkMemberPost({ req, res, deps })) return;
      const body = memberStringBody({ body: req.body, kind: "setPassword" });
      if (!body) { res.status(400).json({ error: "expected password and optional currentPassword strings" }); return; }
      const sessionToken = readRequestCookie({ request: req, name: MEMBER_SESSION_COOKIE });
      const session = await resolveMemberSession({ sessions: deps.memberSessionRepo, workspaceId: deps.workspaceId,
        sessionToken, nowIso: nowIso({ clock: deps.clock }) });
      if (!session) throw new MemberAuthError("INVALID_CREDENTIALS");
      if (!await checkMemberRequestLimits({ req, res, deps, ipLimiter: deps.passwordSignInPerIpLimiter,
        identity: { key: session.memberId, limiter: deps.passwordSetPerMemberLimiter } })) return;
      res.json(await setMemberPassword({ deps: toPublicMembersWriteServiceDeps(deps), input: {
        workspaceId: deps.workspaceId, sessionToken, password: body.password, currentPassword: body.currentPassword,
      } }));
    } catch (error) { sendMemberAuthError({ res, error }, { reset: true }); }
  });
}
