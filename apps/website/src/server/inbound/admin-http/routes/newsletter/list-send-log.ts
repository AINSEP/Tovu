import { NewsletterCampaignNotFoundError } from "@jini-ai/user-management/newsletter/errors";
import { ToolInputError } from "@jini-ai/core";
import { decodeListCursor, pageFromOverfetch, parseListPageRequest } from "@jini-ai/core/list-page";
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

      const { limit, cursor } = parseListPageRequest({ value: req.query }, { defaultLimit: 100, maxLimit: 100 });
      const after = cursor != null ? decodeListCursor({ cursor, shape: ["string"] }) : null;
      const afterId = after ? String(after[0]) : undefined;
      const rows = await deps.newsletterSendRepo.listByCampaign({ workspaceId: deps.workspaceId, campaignId, afterId, limit: limit + 1 });
      const page = pageFromOverfetch({ rows, limit, positionOf: row => [row.id] });
      res.status(200).json({ ...toDataResponse({ data: page.items }), nextCursor: page.nextCursor });
    } catch (err) {
      if (err instanceof ToolInputError) {
        res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
        return;
      }
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
