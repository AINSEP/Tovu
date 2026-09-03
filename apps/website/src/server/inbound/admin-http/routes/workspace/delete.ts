import { deleteWorkspace, WorkspaceLastRemainingError, WorkspaceNotFoundError } from "#src/features/workspace/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * DELETE workspaces/:workspaceId — `DELETE_WORKSPACE` (SPEC-044 REQ-05/INV-03, AC-06).
 * `:workspaceId` must equal the caller's own workspace (INV-04, checked before authorization, and
 * before the last-workspace guard — EC-04: an unauthorized caller learns nothing about workspace
 * count). Gated by `workspace.manage`.
 *
 * `deleteWorkspace`'s INV-03 guard (`@jini-ai/cms/workspace`'s `delete.ts`) refuses only when the
 * target is the install's LAST remaining workspace ROW (`repo.list().length <= 1`) — it does not
 * check the row against this process's own fixed `deps.workspaceId`. In v1 this route always
 * refuses in practice only because a v1 install always has exactly one workspace row today; the
 * moment a second, addressable workspace row exists, an admin can create it and then successfully
 * DELETE this process's own `deps.workspaceId`, leaving the running app pointed at a workspace id
 * that no longer resolves. Not a privilege-escalation path (still gated by `workspace.manage`), but
 * the guarantee is row-count-based, not identity-based — see this dispatch's report for the open
 * recommendation on whether the guard should additionally refuse `deps.workspaceId` specifically.
 */
export const registerAdminWorkspaceDeleteRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

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

      await deleteWorkspace({ deps: { repo: deps.workspaceRepo }, input: { id: deps.workspaceId } });

      res.status(204).send();
    } catch (err) {
      if (err instanceof WorkspaceLastRemainingError) {
        res.status(409).json({ error: err.message, code: "LAST_WORKSPACE" });
        return;
      }

      if (err instanceof WorkspaceNotFoundError) {
        res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
