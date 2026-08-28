import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import type { RouteRegistrar } from "../../../../routes/types.js";
import type { NewsletterRouteDeps } from "./deps.js";

/** `LIST_LISTS` (api.spec.md §1) — `GET .../newsletter/lists`. `admin.newsletter.read`-gated. */
export const registerAdminNewsletterListListsRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/lists", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.read",
        "newsletter_list",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const lists = await deps.newsletterListRepo.list({ workspaceId: deps.workspaceId });
      res.status(200).json(toDataResponse(lists));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
