import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import type { CampaignCounters, CampaignRecord, CampaignRevision } from "./types.js";

/**
 * @file Row types and mapping for the newsletter tables, shared by every dialect. The campaign pair
 * is in the migrated core schema, so its columns are the generated `ContentDatabase` types
 * (snake_case, JSON as compact text). Neutral on purpose: no repo, no driver.
 */

export type CampaignTableRow = Selectable<ContentDatabase["newsletter_campaigns"]>;
export type CampaignRevisionTableRow = Selectable<ContentDatabase["newsletter_campaign_revisions"]>;

/** One `newsletter_campaigns` row as a {@link CampaignRecord}. */
export function toCampaignRecord(row: CampaignTableRow): CampaignRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status as CampaignRecord["status"],
    subject: row.subject,
    preheader: row.preheader,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    listId: row.list_id,
    scheduledAt: row.scheduled_at,
    sendStartedAt: row.send_started_at,
    audienceSnapshotId: row.audience_snapshot_id,
    counters: JSON.parse(row.counters_json) as CampaignCounters,
    version: row.version,
    createdByPrincipal: row.created_by_principal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The `newsletter_campaigns` row an INSERT writes. */
export function toCampaignRow(c: CampaignRecord): Insertable<ContentDatabase["newsletter_campaigns"]> {
  return {
    id: c.id,
    workspace_id: c.workspaceId,
    status: c.status,
    subject: c.subject,
    preheader: c.preheader,
    from_name: c.fromName,
    from_email: c.fromEmail,
    reply_to: c.replyTo,
    list_id: c.listId,
    scheduled_at: c.scheduledAt,
    send_started_at: c.sendStartedAt,
    audience_snapshot_id: c.audienceSnapshotId,
    counters_json: JSON.stringify(c.counters),
    version: c.version,
    created_by_principal: c.createdByPrincipal,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

/**
 * The columns a re-save overwrites: everything except the key and the counters, which are
 * insert-only here (`incrementCounter` owns them afterwards, see `ports.ts`).
 */
export function updatableCampaignColumns(row: Insertable<ContentDatabase["newsletter_campaigns"]>) {
  const { id: _id, counters_json: _counters, ...updatable } = row;
  return updatable;
}

/** One `newsletter_campaign_revisions` row as a {@link CampaignRevision}. */
export function toCampaignRevision(row: CampaignRevisionTableRow): CampaignRevision {
  return {
    campaignId: row.campaign_id,
    workspaceId: row.workspace_id,
    seq: row.seq,
    state: JSON.parse(row.state_json) as CampaignRecord,
    actorId: row.actor_id,
    recordedAt: row.recorded_at,
  };
}
