import { saveCampaign } from "#src/features/newsletter/campaign-write-service";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toCampaignWriteServiceDeps, type NewsletterRouteDeps } from "./deps.js";

/** This route's five required string fields, in the one order used for validation. */
const REQUIRED_CAMPAIGN_STRING_FIELDS = ["subject", "fromName", "fromEmail", "replyTo", "listId"] as const;

/** This route's campaign fields, validated and read off an untyped body in one place, or `null` if
 *  a required field is missing or the wrong shape.
 *  @complexity O(1) — iterates a fixed 5-entry field list. */
function parseCreateCampaignBody(rawBody: unknown): {
  subject: string;
  bodyJson: Record<string, unknown>;
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
  if (typeof body.bodyJson !== "object" || body.bodyJson === null || Array.isArray(body.bodyJson)) {
    return null;
  }
  return {
    subject: body.subject as string,
    bodyJson: body.bodyJson as Record<string, unknown>,
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
 * The bespoke campaign table (ADR-PIPE-011 Decision §2) stores only envelope fields, which
 * previously caused this route to validate then discard bodyJson. The write chokepoint now keeps
 * the document in its existing same-transaction revision state_json; detail reads project the
 * latest document alongside the live envelope; list reads keep only the envelope. No new column or alternate content owner is needed.
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
