import { scheduleCampaign } from "../../../../newsletter/campaign-write-service";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "../../../http/admin/newsletter";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../types";
import { toCampaignWriteServiceDeps, type NewsletterRouteDeps } from "./deps";

/**
 * `SCHEDULE_CAMPAIGN` (api.spec.md §1/§4) — `POST .../campaigns/:id/schedule`, `draft` ->
 * `scheduled`. `scheduledAt` is optional (absent/null = send as soon as the pipeline picks it up);
 * `scheduleCampaign` (`campaign-write-service.ts`) requires a `string`, so an absent/null value
 * defaults to "now" here at the route layer (a reasonable, disclosed route-level interpretation of
 * "as soon as the pipeline picks it up" — the write chokepoint's own type does not model a null
 * `scheduledAt`, and changing that type is out of this dispatch's scope).
 */
export const registerAdminNewsletterScheduleCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/schedule", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (body.scheduledAt !== undefined && body.scheduledAt !== null && typeof body.scheduledAt !== "string") {
      res.status(400).json({ error: "scheduledAt must be a date-time string when provided", code: "NEWSLETTER_VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.campaign.schedule",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : deps.clock.nowIso();
      const { campaign } = await scheduleCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: { workspaceId: deps.workspaceId, id: String(req.params.id), actorId: getAuthedPrincipal(res).id, scheduledAt },
      });
      res.status(200).json(toDataResponse(campaign));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
