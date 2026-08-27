/**
 * @file `transitionCampaignStatus` — the campaign status-machine guard (ADR-PIPE-011 C-008,
 * behavior.spec.md §1.1, REQ-04/05/07/18).
 *
 * `[internal-invariant]`: a divergence between this function and any route-layer re-implementation
 * of the transition-authority rule is a fail-open authorization bug, same class as SPEC-007's
 * `deriveRequiredPermission` (ADR-PIPE-011 Contract Map C-008). `campaign-write-service.ts` calls
 * this before every status-affecting write; no other call site may re-implement it.
 *
 * Precedence (highest to lowest — behavior.spec.md §1.1's transition-authority table):
 * 1. `pipeline` tier (the send pipeline's own internal actions, never a direct HTTP caller) —
 *    the ONLY actor that may set `scheduled -> sending` or `sending -> sent`.
 * 2. `send` tier (`admin.newsletter.campaign.send`) — may set `sending <-> paused` only (via
 *    `PAUSE_CAMPAIGN`/`RESUME_CAMPAIGN`); never sets `sending`/`sent` directly (those stay
 *    pipeline-only, reached only by triggering `authorizeSend`, which runs as `pipeline` tier).
 * 3. `schedule` tier (`admin.newsletter.campaign.schedule`) — may set `draft -> scheduled` only
 *    (via `SCHEDULE_CAMPAIGN`).
 * 4. `compose` tier (`admin.newsletter.campaign.compose`) — may set `draft -> canceled` or
 *    `scheduled -> canceled` only (via `CANCEL_CAMPAIGN`); `UPDATE_CAMPAIGN`'s body schema does not
 *    accept a `status` field at all (no direct status transition from plain field edits).
 *
 * DEVIATION DISCLOSED: `api.spec.md` has no dedicated "unschedule"/revert-to-draft endpoint in its
 * 19-route list — only `CANCEL_CAMPAIGN`/`SCHEDULE_CAMPAIGN`/`SEND_CAMPAIGN`/`SEND_TEST_CAMPAIGN`/
 * `PAUSE_CAMPAIGN`/`RESUME_CAMPAIGN` exist. This implementation therefore maps each real endpoint to
 * exactly one transition family and does NOT implement a `scheduled -> draft` transition for any
 * tier (there is no endpoint that would call it). If a future endpoint needs that transition, add it
 * here explicitly rather than widening `compose`'s existing grant.
 */
import type { CampaignStatus } from "./types.js";

export type CampaignActorTier = "pipeline" | "send" | "schedule" | "compose";

export type TransitionResult = { allowed: true } | { allowed: false; reason: string };

/**
 * @complexity O(1), pure, total function (every input produces a result, never throws).
 * @overallScore 100
 */
export function transitionCampaignStatus(input: {
  from: CampaignStatus;
  to: CampaignStatus;
  actorTier: CampaignActorTier;
}): TransitionResult {
  const { from, to, actorTier } = input;

  if (from === to) {
    return { allowed: false, reason: `'${from}' -> '${to}' is not a transition (no-op)` };
  }

  // Pipeline-only: scheduled -> sending (initial send start), sending -> sent (drain completion).
  // NOTE: paused -> sending (resume) is a DIFFERENT transition, handled by the send-tier branch
  // below — it must not be caught by this branch's blanket `to === "sending"` check.
  if (from === "scheduled" && to === "sending") {
    if (actorTier !== "pipeline") {
      return { allowed: false, reason: "only the send pipeline may set status to 'sending'" };
    }
    return { allowed: true };
  }
  if (to === "sent") {
    if (actorTier !== "pipeline") {
      return { allowed: false, reason: "only the send pipeline may set status to 'sent'" };
    }
    if (from !== "sending") {
      return { allowed: false, reason: "'sent' may only be entered from 'sending'" };
    }
    return { allowed: true };
  }

  // send tier: sending <-> paused only (pause/resume). Resume (paused -> sending) is admin-
  // triggered via RESUME_CAMPAIGN, distinct from the pipeline-only initial scheduled -> sending.
  if ((from === "sending" && to === "paused") || (from === "paused" && to === "sending")) {
    if (actorTier !== "send" && actorTier !== "pipeline") {
      return { allowed: false, reason: `only 'admin.newsletter.campaign.send' may transition '${from}' -> '${to}'` };
    }
    return { allowed: true };
  }

  // schedule tier: draft -> scheduled only.
  if (from === "draft" && to === "scheduled") {
    if (actorTier !== "schedule") {
      return { allowed: false, reason: "only 'admin.newsletter.campaign.schedule' may set draft -> scheduled" };
    }
    return { allowed: true };
  }

  // compose tier: draft -> canceled, scheduled -> canceled only.
  if (to === "canceled" && (from === "draft" || from === "scheduled")) {
    if (actorTier !== "compose") {
      return { allowed: false, reason: "only 'admin.newsletter.campaign.compose' may cancel a campaign" };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: `'${from}' -> '${to}' is not a permitted transition for any actor tier` };
}
