import {
  summarizePublishReport,
  toPublishReportRows,
  type PublishContentPlanResult,
  type PublishContentReport,
} from "@tovu/publish-content-ui";

import type { AdminPublishDestination } from "@/lib/api";

/**
 * @file Pure rules behind the Sites Export tab's Publish list (owner, 2026-10-18): which action a
 * past destination offers, how long ago it was published, and what a content plan allows. Nothing
 * here names a host; every label and target comes from the destinations API.
 */

/** A row's one action: publish again, connect its deploy as a Tovu peer first, or nothing the
 *  viewer may run. */
export type SitePublishAction = "publish" | "connect" | null;

/** What the viewer may run, from `/auth/me`. `known` is false until that read lands. */
export interface SitePublishPermissions {
  readonly known: boolean;
  /** `system.publish`: replay a static publish. */
  readonly canPublishStatic: boolean;
  /** `publish_content.apply`: push content to a Tovu peer, or connect one. */
  readonly canPublishContent: boolean;
}

/** Permission ids, exactly as the publish routes check them. */
export const STATIC_PUBLISH_PERMISSION = "system.publish";
export const CONTENT_PUBLISH_PERMISSION = "publish_content.apply";

/** The Tovu peer a row publishes content to: the peer itself, or the peer saved at a deploy's
 *  address. `null` for a static host or an unlinked deploy. @complexity O(1). */
export function destinationPeerId(destination: AdminPublishDestination): string | null {
  if (destination.kind === "tovu-peer") return destination.peerId;
  if (destination.kind === "deploy") return destination.linkedPeerId ?? null;
  return null;
}

/** The action a row offers this viewer. Content actions also need a site that can publish to live
 *  at all (`publish-availability.store.ts`: the live site itself cannot). @complexity O(1). */
export function destinationAction(input: {
  destination: AdminPublishDestination;
  permissions: SitePublishPermissions;
  liveAvailable: boolean;
}): SitePublishAction {
  const { destination, permissions } = input;
  if (!permissions.known) return null;
  if (destination.kind === "static") return permissions.canPublishStatic ? "publish" : null;
  if (!permissions.canPublishContent || !input.liveAvailable) return null;
  return destinationPeerId(destination) === null ? "connect" : "publish";
}

/** The kind badge's English key; the dictionary translates it. @complexity O(1). */
export function destinationKindLabel(kind: AdminPublishDestination["kind"]): string {
  if (kind === "static") return "Static site";
  if (kind === "tovu-peer") return "Tovu site";
  return "Deploy";
}

const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago" in the viewer's locale (Intl, so every admin locale reads it without a dictionary).
 *  An unreadable timestamp is shown as stored rather than hidden. @complexity O(1). */
export function relativePublishedTime(input: { iso: string; nowMs: number; locale: string }): string {
  const at = Date.parse(input.iso);
  if (Number.isNaN(at)) return input.iso;
  const seconds = Math.round((at - input.nowMs) / 1000);
  const format = new Intl.RelativeTimeFormat(input.locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

/** What a whole-site content plan allows without the operator choosing anything: refused, nothing
 *  to write, or a publish of the clean rows. Conflicts are never forced here; `skipped` counts them
 *  so the row can send the operator to the full Publish dialog. @complexity O(n) rows. */
export type PeerPlanDecision =
  | { readonly kind: "refused"; readonly reason: string | null }
  | { readonly kind: "nothing"; readonly skipped: number }
  | { readonly kind: "publish"; readonly skipped: number };

export function peerPlanDecision(plan: Pick<PublishContentPlanResult, "details">): PeerPlanDecision {
  if (plan.details.refused) return { kind: "refused", reason: plan.details.refusalReason };
  const summary = summarizePublishReport(toPublishReportRows(plan.details));
  if (summary.publishing === 0) return { kind: "nothing", skipped: summary.skipped };
  return { kind: "publish", skipped: summary.skipped };
}

/** Rows a finished run skipped: the execute report when the peer sent one (it includes race-time
 *  skips), else the plan's. @complexity O(n) rows. */
export function skippedAfterPublish(input: { plan: PublishContentReport; executed?: PublishContentReport }): number {
  return summarizePublishReport(toPublishReportRows(input.executed ?? input.plan)).skipped;
}
