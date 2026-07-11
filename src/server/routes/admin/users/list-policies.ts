import { toAdminPolicyResponse } from "../../../http/admin/users";
import type { RouteRegistrar } from "../../types";

/** GET policies — list a workspace's policies (built-in + custom) for the Users admin screen's policy picker. */
export const registerAdminPolicyListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/policies", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const policies = await deps.policyRepo.list({ workspaceId: deps.workspaceId });
      res.json({ policies: policies.map(toAdminPolicyResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
