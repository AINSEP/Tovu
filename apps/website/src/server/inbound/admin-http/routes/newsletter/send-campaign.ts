import { authorizeSend, claimBatch, freezeAudience } from "#src/features/newsletter/send-pipeline";
import { mapNewsletterErrorToResponse, requireNewsletterPermissionOrRespond, toDataResponse } from "#src/server/inbound/admin-http/http/newsletter";
import type { RouteRegistrar } from "#src/server/routes/types";
import { toSendPipelineDeps, type NewsletterRouteDeps } from "./deps.js";

/**
 * `SEND_CAMPAIGN` (api.spec.md §1/§5) — `POST .../campaigns/:id/send`. `admin.newsletter.
 * campaign.send`-gated. No request body — the Launch Readiness Gate is evaluated server-side,
 * never a client-supplied override (REQ-21).
 *
 * Chains `authorizeSend` -> `freezeAudience` -> `claimBatch` (orchestrator.spec.md §5:
 * `onFreezeAudience` runs "immediately after `authorizeSend` commits, before any batch is
 * claimed"), mirroring `routes/admin/posts/update.ts`'s inline `processOutbox` drain-after-write
 * idiom (`claimBatch` IS `processOutbox` for this pipeline — see `send-pipeline.ts`). Responds
 * `202` with the campaign as soon as `authorizeSend` itself succeeds (its own committed `status:
 * 'sending'`) — `freezeAudience`/`claimBatch` run best-effort immediately after; per
 * orchestrator.spec.md §5, a `freezeAudience` failure "leaves the campaign `sending` with no
 * snapshot — resumable by re-running `freezeAudience`, never silently retried as a duplicate
 * snapshot", so it is logged and swallowed here rather than downgrading an already-committed 202
 * into a 500 the client would misread as "the send never started."
 *
 * In practice `authorizeSend` always throws `NEWSLETTER_LAUNCH_GATE_BLOCKED` (409) in both
 * composition roots today: no real `MailerPort` adapter exists anywhere in this repo yet (`console`/
 * `memory` driver always fails Launch Gate precondition (d)) — by design, not a gap this route can
 * or should close (see tasks.md's "Real Sending Is Inherently Blocked Today" flag).
 */
export const registerAdminNewsletterSendCampaignRoute: RouteRegistrar = (app, routeDeps) => {
  const deps = routeDeps as NewsletterRouteDeps;

  app.post("/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/send", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = await requireNewsletterPermissionOrRespond(
        deps.authorize,
        deps.workspaceId,
        "admin.newsletter.campaign.send",
        "newsletter_campaign",
        res
      );
      if (!principal) return;

      await deps.newsletterReady;
      const sendPipelineDeps = toSendPipelineDeps(deps);
      const { campaign } = await authorizeSend({
        deps: sendPipelineDeps,
        input: { workspaceId: deps.workspaceId, campaignId: String(req.params.id) },
      });
      res.status(202).json(toDataResponse(campaign));

      try {
        await freezeAudience({
          deps: sendPipelineDeps,
          input: { workspaceId: deps.workspaceId, campaignId: campaign.id, listId: campaign.listId },
        });
        await claimBatch({ deps: sendPipelineDeps });
      } catch (freezeErr) {
        // eslint-disable-next-line no-console
        console.error(`freezeAudience/claimBatch failed after authorizeSend for campaign ${campaign.id}: ${(freezeErr as Error).message}`);
      }
    } catch (err) {
      mapNewsletterErrorToResponse(err, res);
    }
  });
};
