/**
 * @file Shared `RouteDeps` extension for the newsletter admin + public routes (ADR-PIPE-011 wiring).
 *
 * Purpose:
 * `src/server/routes/types.ts` is being extended by several parallel agents right now (each wiring
 * a different admin section) — this file follows the exact precedent
 * `src/server/routes/admin/members/deps.ts` established: define `NewsletterRouteDeps` here
 * (`RouteDeps` intersected with what Newsletter's routes/domain layer need) rather than editing the
 * shared file directly. Each route in this directory narrows its `RouteDeps` argument via a cast
 * (safe: `NewsletterRouteDeps` is a strict extension, never a widening). `server/deps.ts`/
 * `server/app.ts`'s composition roots widen their OWN return-type annotation to
 * `NewsletterRouteDeps` (not `RouteDeps`) so the extra fields type-check without an unsafe cast at
 * the construction site — once `RouteDeps` is amended upstream to declare these fields directly,
 * that widened annotation becomes provably redundant and can be deleted with no behavior change.
 */
import type { MembersConsentCapability, NewsletterCampaignRepoPort, NewsletterListRepoPort, NewsletterSubscriptionRepoPort, NewsletterAudienceSnapshotRepoPort, NewsletterSendRepoPort, NewsletterConfirmationTokenRepoPort } from "../../../../newsletter/ports";
import type { RouteDeps } from "../../types";

export interface NewsletterRouteDeps extends RouteDeps {
  /** Fire-and-forget at boot (mirrors `settingsReady`/`menuBindingsReady`) — await before relying on the `p_newsletter__*` tables existing. */
  newsletterReady: Promise<void>;
  newsletterCampaignRepo: NewsletterCampaignRepoPort;
  newsletterListRepo: NewsletterListRepoPort;
  newsletterSubscriptionRepo: NewsletterSubscriptionRepoPort;
  newsletterAudienceSnapshotRepo: NewsletterAudienceSnapshotRepoPort;
  newsletterSendRepo: NewsletterSendRepoPort;
  newsletterConfirmationTokenRepo: NewsletterConfirmationTokenRepoPort;
  /**
   * The not-yet-implemented Members consent seam (ADR-PIPE-011 Risks item 3). `null` is the
   * CORRECT default state until Members ships a real binding — the Launch Readiness Gate's
   * precondition (b) checks for a real (non-null) binding; a Newsletter-local stand-in that
   * returns success by default must never be substituted here.
   */
  membersConsentCapability: MembersConsentCapability | null;
}
