import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../../platform/db/content-database.generated.js";
import { toBool } from "../../platform/db/kernel/index.js";
import type {
  AudienceSnapshotRow,
  CampaignCounters,
  CampaignRecord,
  CampaignRevision,
  ConfirmationTokenRecord,
  NewsletterListRow,
  SendRow,
  SubscriptionRow,
} from "./types.js";

/**
 * @file Row types and mapping for the newsletter tables, shared by every dialect. The campaign pair
 * is in the migrated core schema, so its columns are the generated `ContentDatabase` types
 * (snake_case, JSON as compact text). The five `p_newsletter__*` tables are created by the
 * dataModule engine (`data-module-manifest.ts`), not the migrated schema, so they are NOT in
 * `ContentDatabase`: the repo brings them into a query with Kysely's `withTables<NewsletterTables>()`.
 * Neutral on purpose: no repo, no driver.
 */

export type ListTableRow = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  is_default: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SubscriptionTableRow = {
  id: string;
  workspace_id: string;
  list_id: string;
  subscriber_id: string;
  status: string;
  source: string;
  consent_revision_id_at_subscribe: string | null;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AudienceSnapshotTableRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  list_id: string;
  recipient_count: number;
  created_at: string;
};

export type SendTableRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  audience_snapshot_id: string;
  subscriber_id: string;
  recipient_email: string;
  status: string;
  attempts: number;
  idempotency_key: string;
  provider_message_id: string | null;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConfirmationTokenTableRow = {
  id: string;
  workspace_id: string;
  subscription_id: string;
  token_hash: string;
  purpose: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

/** The tables the newsletter repos add to the content kernel's schema. Type aliases, not interfaces:
 *  Kysely's `withTables` needs the implicit index signature only an alias has. */
export type NewsletterTables = {
  p_newsletter__lists: ListTableRow;
  p_newsletter__subscriptions: SubscriptionTableRow;
  p_newsletter__audience_snapshots: AudienceSnapshotTableRow;
  p_newsletter__sends: SendTableRow;
  p_newsletter__confirmation_tokens: ConfirmationTokenTableRow;
};

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

/** One `p_newsletter__lists` row as a {@link NewsletterListRow}; `is_default` is read through `toBool`. */
export function toListRecord(row: Selectable<ListTableRow>): NewsletterListRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    isDefault: toBool(row.is_default) === true,
    status: row.status as NewsletterListRow["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The `p_newsletter__lists` row an INSERT writes. */
export function toListRow(row: NewsletterListRow): Insertable<ListTableRow> {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    name: row.name,
    slug: row.slug,
    is_default: row.isDefault ? 1 : 0,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** The columns a re-save of a list overwrites: everything except the key, workspace and creation time. */
export function updatableListColumns(row: Insertable<ListTableRow>) {
  const { id: _id, workspace_id: _workspace, created_at: _created, ...updatable } = row;
  return updatable;
}

/** One `p_newsletter__subscriptions` row as a {@link SubscriptionRow}. */
export function toSubscriptionRecord(row: Selectable<SubscriptionTableRow>): SubscriptionRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    listId: row.list_id,
    subscriberId: row.subscriber_id,
    status: row.status as SubscriptionRow["status"],
    source: row.source as SubscriptionRow["source"],
    consentRevisionIdAtSubscribe: row.consent_revision_id_at_subscribe,
    subscribedAt: row.subscribed_at,
    unsubscribedAt: row.unsubscribed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The `p_newsletter__subscriptions` row an INSERT writes. */
export function toSubscriptionRow(row: SubscriptionRow): Insertable<SubscriptionTableRow> {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    list_id: row.listId,
    subscriber_id: row.subscriberId,
    status: row.status,
    source: row.source,
    consent_revision_id_at_subscribe: row.consentRevisionIdAtSubscribe,
    subscribed_at: row.subscribedAt,
    unsubscribed_at: row.unsubscribedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** The columns a re-save of a subscription overwrites: its lifecycle, not its identity (list, subscriber, source, creation). */
export function updatableSubscriptionColumns(row: Insertable<SubscriptionTableRow>) {
  return {
    status: row.status,
    consent_revision_id_at_subscribe: row.consent_revision_id_at_subscribe,
    subscribed_at: row.subscribed_at,
    unsubscribed_at: row.unsubscribed_at,
    updated_at: row.updated_at,
  };
}
