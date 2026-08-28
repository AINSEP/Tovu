import { cancelCampaign } from "#src/features/newsletter/campaign-write-service";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/http/admin/newsletter";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "../../types.js";
import { toCampaignWriteServiceDeps, type NewsletterRouteDeps } from "./deps.js";

/**
 * `CANCEL_CAMPAIGN` (api.spec.md §1/§5) — `POST .../campaigns/:id/cancel`. `admin.newsletter.
 * campaign.compose`-gated (cancel is a compose-tier transition per `campaign.ts`'s
 * `transitionCampaignStatus`). Returns the canceled campaign (200), not `204`.
 */
export const registerAdminNewsletterCancelCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/cancel", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.campaign.compose",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const { campaign } = await cancelCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: { workspaceId: deps.workspaceId, id: String(req.params.id), actorId: getAuthedPrincipal(res).id },
      });
      res.status(200).json(toDataResponse(campaign));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
