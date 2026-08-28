import { saveCampaign } from "#src/features/newsletter/campaign-write-service";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toCampaignWriteServiceDeps, type NewsletterRouteDeps } from "./deps.js";

/** This route's five required string fields, in the one order used for validation. */
const REQUIRED_CAMPAIGN_STRING_FIELDS = ["subject", "fromName", "fromEmail", "replyTo", "listId"] as const;

/** This route's six body fields, validated and read off an untyped body in one place, or `null` if
 *  a required field is missing or the wrong shape.
 *  @complexity O(1) — iterates a fixed 5-entry field list. */
function parseCreateCampaignBody(rawBody: unknown): {
  subject: string;
  preheader: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  listId: string;
} | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  for (const name of REQUIRED_CAMPAIGN_STRING_FIELDS) {
    if (typeof body[name] !== "string") {
      return null;
    }
  }
  if (typeof body.bodyJson !== "object" || body.bodyJson === null) {
    return null;
  }
  return {
    subject: body.subject as string,
    preheader: typeof body.preheader === "string" ? body.preheader : null,
    fromName: body.fromName as string,
    fromEmail: body.fromEmail as string,
    replyTo: body.replyTo as string,
    listId: body.listId as string,
  };
}

/**
 * `CREATE_CAMPAIGN` (api.spec.md §1/§4) — `POST .../newsletter/campaigns`, creates a `draft`
 * campaign. `admin.newsletter.campaign.compose`-gated.
 *
 * DISCLOSED GAP (found while wiring, not fixed — out of this dispatch's scope, which is routes
 * only): api.spec.md's request contract names a required `bodyJson` field (the campaign's TipTap
 * document), but `campaign-write-service.ts`'s `saveCampaign` (Stage 2, already implemented) has no
 * such field on its input, and `src/platform/db/schema.ts`'s `newsletterCampaigns` table has no
 * body/content column at all — ADR-PIPE-011 Decision §2 superseded the original ADR-034 draft's
 * "campaign is an `entries` content-type row" design with a bespoke Drizzle pair that only carries
 * the envelope fields (subject/preheader/from/replyTo/listId), and api.spec.md's request contract
 * was never updated to match. This route validates `bodyJson`'s presence (satisfying the
 * documented request shape) but cannot persist it — there is no real slot to put it in without
 * changing `campaign-write-service.ts`'s domain logic, which is out of bounds for this task.
 */
export const registerAdminNewsletterCreateCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const parsedBody = parseCreateCampaignBody(req.body);
    if (!parsedBody) {
      res.status(400).json({
        error: "subject, fromName, fromEmail, replyTo, listId (strings) and bodyJson (object) are required",
        code: "VALIDATION_ERROR",
      });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.campaign.compose",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const { campaign } = await saveCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          actorId: getAuthedPrincipal(res).id,
          fields: parsedBody,
        },
      });
      res.status(201).json(toDataResponse(campaign));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
