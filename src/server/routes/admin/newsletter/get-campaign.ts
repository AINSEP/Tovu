import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "../../../http/admin/newsletter";
import { NewsletterCampaignNotFoundError } from "../../../../newsletter/errors";
import type { RouteRegistrar } from "../../types";
import type { NewsletterRouteDeps } from "./deps";

/** `GET_CAMPAIGN` (api.spec.md §1) — fetch a single campaign. `admin.newsletter.read`-gated. */
export const registerAdminNewsletterGetCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.read",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const campaign = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: String(req.params.id) });
      if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${req.params.id} was not found`);
      res.status(200).json(toDataResponse(campaign));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
