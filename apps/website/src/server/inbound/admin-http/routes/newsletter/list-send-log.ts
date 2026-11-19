import { NewsletterCampaignNotFoundError } from "#src/features/newsletter/index";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** `LIST_SEND_LOG` (api.spec.md §1) — `GET .../newsletter/campaigns/:id/sends`. `admin.newsletter.subscriber.read`-gated (PII-adjacent). */
export const registerAdminNewsletterListSendLogRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/sends", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.subscriber.read", entityType: "newsletter_campaign", res });
      if (!principal) return;

      await deps.newsletterReady;
      const campaignId = String(req.params.id);
      const campaign = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: campaignId });
      if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${campaignId} was not found`);

      const rows = await deps.newsletterSendRepo.listByCampaign({ workspaceId: deps.workspaceId, campaignId });
      res.status(200).json(toDataResponse({ data: rows }));
    } catch (err) {
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
