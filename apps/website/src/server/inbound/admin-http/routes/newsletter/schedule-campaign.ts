import { scheduleCampaign } from "#src/features/newsletter/campaign-write-service";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toCampaignWriteServiceDeps, type NewsletterRouteDeps } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";

/** True when `scheduledAt` is a valid request value: absent, `null`, or a string.
 *  @complexity O(1). */
function isValidScheduledAt({ rawBody }: { rawBody: unknown }, _optional = {}): boolean {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return body.scheduledAt === undefined || body.scheduledAt === null || typeof body.scheduledAt === "string";
}

/** Resolves the request's `scheduledAt` to the caller's string, or `nowIso` when absent/null —
 *  see the route doc above for why "as soon as the pipeline picks it up" defaults to "now" here.
 *  @complexity O(1). */
function resolveScheduledAt({ rawBody, nowIso }: { rawBody: unknown; nowIso: string }, _optional = {}): string {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return typeof body.scheduledAt === "string" ? body.scheduledAt : nowIso;
}

/**
 * `SCHEDULE_CAMPAIGN` (api.spec.md §1/§4) — `POST .../campaigns/:id/schedule`, `draft` ->
 * `scheduled`. `scheduledAt` is optional (absent/null = send as soon as the pipeline picks it up);
 * `scheduleCampaign` (`campaign-write-service.ts`) requires a `string`, so an absent/null value
 * defaults to "now" here at the route layer (a reasonable, disclosed route-level interpretation of
 * "as soon as the pipeline picks it up" — the write chokepoint's own type does not model a null
 * `scheduledAt`, and changing that type is out of this dispatch's scope).
 */
export const registerAdminNewsletterScheduleCampaignRoute: RouteRegistrar = ({ app, deps: routeDeps }, _options = {}) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/schedule", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    if (!isValidScheduledAt({ rawBody: req.body })) {
      res.status(400).json({ error: "scheduledAt must be a date-time string when provided", code: "NEWSLETTER_VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond({ authorize: deps.authorize, workspaceId: deps.workspaceId, permission: "admin.newsletter.campaign.schedule", entityType: "newsletter_campaign", res });
      if (!principal) return;

      await deps.newsletterReady;
      const scheduledAt = resolveScheduledAt({ rawBody: req.body, nowIso: deps.clock.nowIso() });
      const { campaign } = await scheduleCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: { workspaceId: deps.workspaceId, id: String(req.params.id), actorId: getAuthedPrincipal(res).id, scheduledAt },
      });
      res.status(200).json(toDataResponse({ data: campaign }));
    } catch (err) {
      mapNewsletterErrorToResponse({ err, res });
    }
  });
};
