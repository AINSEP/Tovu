import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import { ToolInputError } from "@jini-ai/core";
import { parseListPageRequest } from "@jini-ai/core/list-page";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

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
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

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
      const paging = parseListPageRequest({ value: req.query }, { defaultLimit: 100, maxLimit: 100 });
      const page = await deps.newsletterCampaignRepo.list({ workspaceId: deps.workspaceId }, paging);
      const filtered = status ? page.items.filter((c) => c.status === status) : page.items;
      res.status(200).json({ ...toDataResponse(filtered), nextCursor: page.nextCursor });
    } catch (err) {
      if (err instanceof ToolInputError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
