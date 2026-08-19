import { toAdminWorkspaceResponse } from "#src/server/http/admin/workspace";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * GET workspaces — SPEC-044 REQ-02. Returns an array containing exactly the caller's own
 * (boot-wired `deps.workspaceId`) workspace — v1 never has more than one row addressable by a
 * running process (see feature.spec.md's Architectural Finding section). Gated by
 * `workspace.manage`.
 */
export const registerAdminWorkspaceListRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces", async (req, res) => {
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

      const own = await deps.workspaceRepo.findById(deps.workspaceId);
      // Defensive: the boot-wired workspaceId always resolves to a real row by construction (the
      // composition root seeds it before any request can be served) — not an expected runtime path.
      const workspaces = own ? [toAdminWorkspaceResponse(own)] : [];
      res.json({ workspaces });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
