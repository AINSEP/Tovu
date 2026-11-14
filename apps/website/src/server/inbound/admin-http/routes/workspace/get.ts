import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { toAdminWorkspaceResponse } from "#src/server/inbound/admin-http/http/workspace";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/**
 * GET workspaces/:workspaceId — SPEC-044 REQ-03. `:workspaceId` must equal the caller's own
 * (boot-wired) workspace, else `404` (INV-04 — matches every other admin route's existing
 * mismatched-workspaceId convention, e.g. `apps/website/src/server/inbound/admin-http/routes/users/list.ts`; checked before
 * authorization so a mismatched id never discloses whether a permission grant exists). Gated by
 * `workspace.manage`.
 */
export const registerAdminWorkspaceGetRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "workspace.manage",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      const workspace = await deps.workspaceRepo.findById({ id: deps.workspaceId });
      if (!workspace) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      res.json({ workspace: toAdminWorkspaceResponse(workspace) });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/workspace/get", code: "INTERNAL_ERROR" });
    }
  });
};
