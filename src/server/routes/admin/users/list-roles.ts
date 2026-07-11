import { toAdminRoleResponse } from "../../../http/admin/users";
import type { RouteRegistrar } from "../../types";

/** GET roles — list a workspace's roles (built-in + custom) for the Users admin screen's role picker. */
export const registerAdminRoleListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/roles", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const roles = await deps.roleRepo.list({ workspaceId: deps.workspaceId });
      res.json({ roles: roles.map(toAdminRoleResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
