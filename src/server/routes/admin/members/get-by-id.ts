import { MemberNotFoundError } from "#src/members/index";
import { toAdminMemberResponse } from "#src/server/http/admin/members";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { MembersRouteDeps } from "./deps";

/**
 * GET a single member by id.
 *
 * No dedicated `getAdminMemberById` business-logic function exists in
 * `src/members` (see `list.ts`'s file note) — this route calls
 * `MemberRepoPort.findById` directly and throws the library's own
 * `MemberNotFoundError` on a miss, mirroring the not-found translation
 * `getAdminPostById` performs internally for posts.
 *
 * ADR-PIPE-013 §1 (FEAT-013 Phase 1): previously ran behind session auth only
 * — no per-action `authorize()` call, unlike `disable.ts`. Closes that live
 * authorization gap by requiring `member.manage`, copying `disable.ts`'s
 * exact call shape (workspace-id 404 check first, then authorize, with
 * `entityId: memberId`).
 */
export const registerAdminMemberGetRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as MembersRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/members/:memberId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const memberId = String(req.params.memberId ?? "");

    try {
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "member.manage",
        workspaceId: deps.workspaceId,
        entityType: "member",
        entityId: memberId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'member.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "member.manage", reason: authResult.reason },
        });
        return;
      }

      const member = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: memberId });
      if (!member) {
        throw new MemberNotFoundError(`member '${memberId}' was not found`);
      }

      res.json({ member: toAdminMemberResponse(member) });
    } catch (err) {
      if (err instanceof MemberNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
