import { trashMember, MemberConflictError, MemberNotFoundError, MemberValidationError } from "#src/features/members/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { MembersRouteDeps } from "./deps.js";

/** DELETE moves a member to Trash. The shared adapter revokes sessions and links in the same
 * transaction; only the existing Trash flows may restore or permanently delete it.
 * @complexity One permission check, one member read and the bound Trash operation.
 */
export const registerAdminMemberDeleteRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;
  app.delete("/api/admin/v1/workspaces/:workspaceId/members/:memberId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" }); return;
    }
    const memberId = String(req.params.memberId ?? "");
    try {
      const principal = getAuthedPrincipal(res);
      if (!await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, permission: "member.manage",
        workspaceId: deps.workspaceId, entityType: "member", entityId: memberId })) return;
      res.json(await trashMember({ workspaceId: deps.workspaceId, memberId, actor: { principalId: principal.id } },
        { members: deps.memberRepo, remove: deps.removeMember, clock: deps.clock }));
    } catch (error) {
      if (error instanceof MemberNotFoundError) { res.status(404).json({ error: error.message }); return; }
      if (error instanceof MemberConflictError) { res.status(409).json({ error: error.message }); return; }
      if (error instanceof MemberValidationError) { res.status(400).json({ error: error.message }); return; }
      res.status(500).json({ error: "internal error" });
    }
  });
};
