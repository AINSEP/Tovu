import { cancelCampaign } from "@jini-ai/user-management/newsletter/campaign-write-service";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toCampaignWriteServiceDeps, type NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/**
 * `CANCEL_CAMPAIGN` (api.spec.md §1/§5) — `POST .../campaigns/:id/cancel`. `admin.newsletter.
 * campaign.compose`-gated (cancel is a compose-tier transition per `campaign.ts`'s
 * `transitionCampaignStatus`). Returns the canceled campaign (200), not `204`.
 */
export const registerAdminNewsletterCancelCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/cancel", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.campaign.compose", entityType: "newsletter_campaign", res });
      if (!principal) return;

      await deps.newsletterReady;
      const { campaign } = await cancelCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: { workspaceId: deps.workspaceId, id: String(req.params.id), actorId: getAuthedPrincipal(res).id },
      });
      res.status(200).json(toDataResponse({ data: campaign }));
    } catch (err) {
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
