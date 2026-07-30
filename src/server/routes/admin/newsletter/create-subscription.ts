import { saveSubscription } from "../../../../newsletter/subscriptions";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "../../../http/admin/newsletter";
import type { RouteRegistrar } from "../../types";
import { toSubscriptionsDeps, type NewsletterRouteDeps } from "./deps";

const VALID_SOURCES = new Set(["admin", "import", "api"]);

/**
 * `CREATE_SUBSCRIPTION` (api.spec.md §1/§4) — `POST .../newsletter/lists/:listId/subscriptions`.
 * `admin.newsletter.subscriber.manage`-gated. `subscriberId` must resolve to an existing Members
 * principal (REQ-10); `source` defaults to `admin`.
 */
export const registerAdminNewsletterCreateSubscriptionRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/lists/:listId/subscriptions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (typeof body.subscriberId !== "string") {
      res.status(400).json({ error: "subscriberId is a required string", code: "VALIDATION_ERROR" });
      return;
    }
    const source = typeof body.source === "string" ? body.source : "admin";
    if (!VALID_SOURCES.has(source)) {
      res.status(400).json({ error: "source must be one of admin, import, api", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.subscriber.manage",
        "newsletter_subscription",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const { subscription } = await saveSubscription({
        deps: toSubscriptionsDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          listId: String(req.params.listId),
          subscriberId: body.subscriberId,
          source: source as "admin" | "import" | "api",
        },
      });
      res.status(201).json(toDataResponse(subscription));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
