import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { MemberNotFoundError } from "@jini-ai/user-management/members/types";
import { toAdminMemberResponse } from "#src/server/inbound/admin-http/http/members";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { MembersRouteDeps } from "./deps.js";

/**
 * GET a single member by id.
 *
 * No dedicated `getAdminMemberById` business-logic function exists in
 * `apps/website/src/features/members/index.ts` (see `list.ts`'s file note) — this route calls
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
export const registerAdminMemberGetRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as MembersRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/members/:memberId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    const memberId = String(req.params.memberId ?? "");

    try {
      const principal = getAuthedPrincipal(res);

      const params = { principalId: principal.id, permission: "member.manage", workspaceId: deps.workspaceId, entityType: "member", entityId: memberId };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

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

      sendAdminFailure({ res, error: err }, { operation: "routes/members/get-by-id", code: "INTERNAL_ERROR" });
    }
  });
};
