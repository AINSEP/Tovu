import { saveCampaign } from "#src/features/newsletter/campaign-write-service";
import { NewsletterCampaignNotFoundError, type NewsletterCampaignRepoPort } from "#src/features/newsletter/index";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/http/admin/newsletter";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RouteRegistrar } from "../../types.js";
import { toCampaignWriteServiceDeps, type NewsletterRouteDeps } from "./deps.js";

type ExistingCampaign = NonNullable<Awaited<ReturnType<NewsletterCampaignRepoPort["findById"]>>>;

/** This route's six patchable string fields, in the one order used for both validation and merge. */
const CAMPAIGN_STRING_FIELD_NAMES = ["subject", "preheader", "fromName", "fromEmail", "replyTo", "listId"] as const;

/**
 * Validates the PATCH body: each of `CAMPAIGN_STRING_FIELD_NAMES` must be a string when present,
 * and `bodyJson` (see the module doc's disclosed gap) must be a non-null object when present. Every
 * field is optional — this is a partial update. Returns the first violation's message, or `null`.
 *
 * @complexity O(1) — iterates a fixed 6-entry field list.
 */
function validateCampaignPatchBody(body: Record<string, unknown>): string | null {
  for (const name of CAMPAIGN_STRING_FIELD_NAMES) {
    const value = body[name];
    if (value !== undefined && typeof value !== "string") {
      return `${name} must be a string when provided`;
    }
  }
  if (body.bodyJson !== undefined && (typeof body.bodyJson !== "object" || body.bodyJson === null)) {
    return "bodyJson must be an object when provided";
  }
  return null;
}

/**
 * Merges the body's provided string fields over the existing campaign's current values.
 * `saveCampaign` (Stage 2) has no partial-update mode of its own — see the module doc — so this
 * route-layer merge is what makes an omitted field a no-op instead of an overwrite with `undefined`.
 *
 * @complexity O(1).
 */
function mergeCampaignPatchFields(
  body: Record<string, unknown>,
  existing: ExistingCampaign
): Pick<ExistingCampaign, (typeof CAMPAIGN_STRING_FIELD_NAMES)[number]> {
  return {
    subject: typeof body.subject === "string" ? body.subject : existing.subject,
    preheader: typeof body.preheader === "string" ? body.preheader : existing.preheader,
    fromName: typeof body.fromName === "string" ? body.fromName : existing.fromName,
    fromEmail: typeof body.fromEmail === "string" ? body.fromEmail : existing.fromEmail,
    replyTo: typeof body.replyTo === "string" ? body.replyTo : existing.replyTo,
    listId: typeof body.listId === "string" ? body.listId : existing.listId,
  };
}

/**
 * `UPDATE_CAMPAIGN` (api.spec.md §1/§4) — `PATCH .../newsletter/campaigns/:id`. Every body field is
 * optional (a true partial update): `campaign-write-service.ts`'s `saveCampaign` (Stage 2) has no
 * partial-update mode of its own (its `input.fields` are all non-optional in the exported
 * function's type — it always overwrites, never merges), so this route reads the existing campaign
 * first and merges any omitted field from its current value before calling `saveCampaign` — a
 * route-layer responsibility, not a change to the write chokepoint's own logic.
 *
 * DISCLOSED GAP (found while wiring, not fixed): api.spec.md describes `UPDATE_CAMPAIGN` as valid
 * "while `draft`/`scheduled`", but `saveCampaign`'s actual guard (`campaign-write-service.ts`) only
 * permits `status === 'draft'` — a `scheduled` campaign is rejected with
 * `NEWSLETTER_CAMPAIGN_NOT_EDITABLE` even though the spec's own prose says it should be editable.
 * This route wires to the existing (already "certified"/tested) Stage 2 guard as-is per this
 * dispatch's explicit boundary against changing Stage 1-4 domain logic; flagged rather than
 * silently patched.
 *
 * Same `bodyJson`-has-no-persisted-slot gap `create-campaign.ts` discloses applies here too — if
 * present, it is type-checked but not persisted.
 */
export const registerAdminNewsletterUpdateCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.patch("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const validationError = validateCampaignPatchBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError, code: "VALIDATION_ERROR" });
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
      const id = String(req.params.id);
      const existing = await deps.newsletterCampaignRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!existing) throw new NewsletterCampaignNotFoundError(`campaign ${id} was not found`);

      const { campaign } = await saveCampaign({
        deps: toCampaignWriteServiceDeps(deps),
        input: {
          workspaceId: deps.workspaceId,
          id,
          actorId: getAuthedPrincipal(res).id,
          fields: mergeCampaignPatchFields(body, existing),
        },
      });
      res.status(200).json(toDataResponse(campaign));
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
