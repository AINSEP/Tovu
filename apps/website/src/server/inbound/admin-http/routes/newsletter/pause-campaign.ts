import { pauseCampaign } from "#src/features/newsletter/send-pipeline";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toSendPipelineDeps, type NewsletterRouteDeps } from "./deps.js";

/** `PAUSE_CAMPAIGN` (api.spec.md §1) — `POST .../campaigns/:id/pause`, `sending` -> `paused`. `admin.newsletter.campaign.send`-gated. */
export const registerAdminNewsletterPauseCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/pause", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.campaign.send",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const { campaign } = await pauseCampaign({
        deps: toSendPipelineDeps(deps),
        input: { workspaceId: deps.workspaceId, campaignId: String(req.params.id) },
      });
      res.status(200).json(toDataResponse(campaign));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
