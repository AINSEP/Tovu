import { sendTestCampaign } from "#src/newsletter/send-pipeline";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond } from "#src/server/http/admin/newsletter";
import type { RouteRegistrar } from "../../types.js";
import { toSendPipelineDeps, type NewsletterRouteDeps } from "./deps.js";

/**
 * `SEND_TEST_CAMPAIGN` (api.spec.md §1/§4/§5) — `POST .../campaigns/:id/send-test`. `admin.
 * newsletter.campaign.send_test`-gated. `testAddresses`: 1-10 emails, never touches the real
 * subscriber list (REQ-20) — `sendTestCampaign` itself enforces the 1-10 bound and evaluates the
 * Launch Gate with `isTestSend: true` (only preconditions (c)/(d), never (a)/(b)).
 */
export const registerAdminNewsletterSendTestCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/send-test", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (!Array.isArray(body.testAddresses) || !body.testAddresses.every((a: unknown) => typeof a === "string")) {
      res.status(400).json({ error: "testAddresses must be an array of email strings", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.campaign.send_test",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const { results } = await sendTestCampaign({
        deps: toSendPipelineDeps(deps),
        input: { workspaceId: deps.workspaceId, campaignId: String(req.params.id), testAddresses: body.testAddresses },
      });
      res.status(200).json({
        data: { results: results.map((r) => ({ address: r.email, ok: r.outcome === "sent", errorCode: r.outcome === "sent" ? null : (r.error ?? null) })) },
      });
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
