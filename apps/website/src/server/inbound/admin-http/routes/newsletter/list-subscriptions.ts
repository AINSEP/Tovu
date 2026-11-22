import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import { ToolInputError } from "@jini-ai/core";
import { parseListPageRequest } from "@jini-ai/core/list-page";
import type { RouteRegistrar } from "#src/server/routes/types";
import type { NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** `LIST_SUBSCRIPTIONS` (api.spec.md §1) — `GET .../newsletter/lists/:listId/subscriptions`. `admin.newsletter.subscriber.read`-gated. */
export const registerAdminNewsletterListSubscriptionsRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.get("/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.subscriber.read", entityType: "newsletter_subscription", res });
      if (!principal) return;

      await deps.newsletterReady;
      const paging = parseListPageRequest({ value: req.query }, { defaultLimit: 100, maxLimit: 100 });
      const page = await deps.newsletterSubscriptionRepo.list({
        workspaceId: deps.workspaceId,
        listId: String(req.params.listId),
      }, paging);
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
