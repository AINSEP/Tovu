import { toAdminWorkspaceResponse } from "#src/server/inbound/admin-http/http/workspace";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
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
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "workspace.manage",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

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
