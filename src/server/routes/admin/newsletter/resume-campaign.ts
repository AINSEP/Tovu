import { resumeCampaign } from "#src/newsletter/send-pipeline";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/http/admin/newsletter";
import type { RouteRegistrar } from "../../types.js";
import { toSendPipelineDeps, type NewsletterRouteDeps } from "./deps.js";

/** `RESUME_CAMPAIGN` (api.spec.md §1) — `POST .../campaigns/:id/resume`, `paused` -> `sending`. `admin.newsletter.campaign.send`-gated. */
export const registerAdminNewsletterResumeCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/resume", async (req, res) => {
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
      const { campaign } = await resumeCampaign({
        deps: toSendPipelineDeps(deps),
        input: { workspaceId: deps.workspaceId, campaignId: String(req.params.id) },
      });
      res.status(200).json(toDataResponse(campaign));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
