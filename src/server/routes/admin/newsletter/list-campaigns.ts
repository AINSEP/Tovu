import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "../../../http/admin/newsletter";
import type { RouteRegistrar } from "../../types";
import type { NewsletterRouteDeps } from "./deps";

/**
 * `LIST_CAMPAIGNS` (api.spec.md §1) — `GET .../newsletter/campaigns`, optionally filtered by
 * `?status=`. `admin.newsletter.read`-gated. No dedicated read-service exists for Newsletter (the
 * spec's write chokepoints are `campaign-write-service.ts`; reads go straight through
 * `NewsletterCampaignRepoPort.list`), mirroring `members/list.ts`'s identical "no read-service
 * wrapper, call the repo directly" precedent.
 */
export const registerAdminNewsletterListCampaignsRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns", async (req, res) => {
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
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const campaigns = await deps.newsletterCampaignRepo.list({ workspaceId: deps.workspaceId });
      const filtered = status ? campaigns.filter((c) => c.status === status) : campaigns;
      res.status(200).json(toDataResponse(filtered));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
