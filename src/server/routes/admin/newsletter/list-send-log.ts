import { NewsletterCampaignNotFoundError } from "#src/newsletter/index";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/http/admin/newsletter";
import type { RouteRegistrar } from "../../types";
import type { NewsletterRouteDeps } from "./deps";

/** `LIST_SEND_LOG` (api.spec.md §1) — `GET .../newsletter/campaigns/:id/sends`. `admin.newsletter.subscriber.read`-gated (PII-adjacent). */
export const registerAdminNewsletterListSendLogRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/sends", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.subscriber.read",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const campaignId = String(req.params.id);
      const campaign = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: campaignId });
      if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${campaignId} was not found`);

      const rows = await deps.newsletterSendRepo.listByCampaign({ workspaceId: deps.workspaceId, campaignId });
      res.status(200).json(toDataResponse(rows));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
