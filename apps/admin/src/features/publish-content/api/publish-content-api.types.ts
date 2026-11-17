import type { PublishContentPeerSummary } from "@tovu/publish-content-ui";

/** Mirrors `PublishDestinationView` in `src/server/inbound/admin-http/routes/publish-content/
 *  destination.ts` — the zero-setup connect action's own response shape. Defined here rather than
 *  re-exported from `@tovu/publish-content-ui` because the destination flow is admin-only: unlike
 *  the plan/confirm/execute contract, no peer-side code shares this shape. */
export interface AdminPublishDestinationView {
  /** `true` once this computer's grant has been written for a site. */
  connected: boolean;
  /** The connected site, as the publish list already models it. `null` when there is none. */
  site: PublishContentPeerSummary | null;
  /** Read out of the repo's deploy config — what to offer when nothing is connected yet. */
  candidateUrl: string | null;
  /** One sentence describing where things stand. */
  message: string;
  /** One sentence naming what the owner does next, or `null` when nothing is pending. */
  nextStep: string | null;
}
