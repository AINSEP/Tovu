import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import { NewsletterCampaignNotFoundError } from "#src/features/newsletter/errors";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** `GET_CAMPAIGN` (api.spec.md §1) — fetch a single campaign. `admin.newsletter.read`-gated. */
export const registerAdminNewsletterGetCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.read", entityType: "newsletter_campaign", res });
      if (!principal) return;

      await deps.newsletterReady;
      const campaign = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id: String(req.params.id) });
      if (!campaign) throw new NewsletterCampaignNotFoundError(`campaign ${req.params.id} was not found`);
      res.status(200).json(toDataResponse({ data: campaign }));
    } catch (err) {
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
