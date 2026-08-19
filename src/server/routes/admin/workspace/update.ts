import { updateWorkspace, WorkspaceConflictError, WorkspaceNotFoundError, WorkspaceValidationError } from "#src/features/workspace/index";
import { toAdminWorkspaceResponse } from "#src/server/http/admin/workspace";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * PATCH workspaces/:workspaceId — `UPDATE_WORKSPACE` (SPEC-044 REQ-04, AC-05). `:workspaceId` must
 * equal the caller's own workspace (INV-04, checked before authorization, same as `get.ts`). Gated
 * by `workspace.manage`.
 */
export const registerAdminWorkspaceUpdateRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "workspace.manage",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'workspace.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "workspace.manage", reason: authResult.reason },
        });
        return;
      }

      const { workspace } = await updateWorkspace({
        deps: { repo: deps.workspaceRepo },
        input: {
          id: deps.workspaceId,
          name: req.body?.name !== undefined ? String(req.body.name) : undefined,
          slug: req.body?.slug !== undefined ? String(req.body.slug) : undefined,
        },
      });

      res.json({ workspace: toAdminWorkspaceResponse(workspace) });
    } catch (err) {
      if (err instanceof WorkspaceValidationError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }

      if (err instanceof WorkspaceConflictError) {
        res.status(409).json({ error: err.message, code: "RESOURCE_CONFLICT", details: { field: "slug" } });
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
