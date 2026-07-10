/**
 * @file Newsletter — core domain types (INTERFACES & TYPES ONLY; no feature logic).
 *
 * Draft ADR-034 (PROPOSED). These types encode the Newsletter design's data model,
 * permission catalog, event/hook vocabulary, and own-table row shapes so the design is
 * compile-checked against the real repo primitives before any implementation exists.
 *
 * Placement (tovu-v2-design.md §3.5): Newsletter is a **Tier-3 bundled plugin**
 * (`plugins/newsletter`) resting on the **Tier-2 `MailerPort` core primitive** (see
 * `./ports.ts`). Campaigns reuse the ADR-022 `entries` editorial substrate; the relational,
 * high-volume audience/delivery state lives in core-mediated own-tables (ADR-023 `dataModule`,
 * namespace `p_newsletter__*`).
 *
 * Grounding imports (typecheck against real code):
 * - `../core/ports` — UUID/ISODateTime/JsonObject/DomainEvent (ADR-007/009 spine).
 * - `../features/plugins/data-module` — the ADR-023 declared-schema shape core executes.
 */
import type { DomainEvent, ISODateTime, JsonObject, UUID } from "../core/ports";
import type { DataModuleDecl } from "../features/plugins/data-module";

/* ------------------------------------------------------------------------------------------------
 * 1. Campaign editorial state — reuses ADR-022 `entries` (content-type `newsletter_campaign`)
 * ------------------------------------------------------------------------------------------------
 * A campaign IS a seeded/registered content-type entry (like `media` in ADR-027): it gets the
 * write chokepoint, append-only revisions, status transitions, and `bodyJson` (TipTap doc) for
 * free. Newsletter-specific fields live under the validated namespaced bag `fields.ext.newsletter.*`.
 */

/** The registered content-type slug for a campaign entry (ADR-022 registry-as-data). */
export const NEWSLETTER_CAMPAIGN_TYPE = "newsletter_campaign" as const;
export type NewsletterCampaignType = typeof NEWSLETTER_CAMPAIGN_TYPE;

/**
 * Campaign lifecycle status. Registry-declared statuses on the campaign content-type.
 * `sending`/`sent`/`paused`/`canceled`/`failed` are terminal-ish states the send pipeline drives;
 * editors only move draft↔scheduled. Once `sending` begins the audience is frozen (§audience snapshot).
 */
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused"
  | "canceled"
  | "failed";

/**
 * Newsletter-specific fields carried under `entries.fields.ext.newsletter.*` (ADR-022 §2),
 * validated on write by the content-type registry. Counters are derived/rebuildable from the
 * `p_newsletter__sends` ledger — stored here only as a denormalized read cache, updated through
 * the ADR-026 atomic multi-write envelope, never authored by the plugin directly.
 */
export interface CampaignFields extends JsonObject {
  /** Email subject line. */
  subject: string;
  /** Inbox-preview / preheader text (optional in practice; required-shape here). */
  preheader: string;
  /** Envelope From display name. */
  fromName: string;
  /** Envelope From address (must pass the workspace's verified-sender check at send time). */
  fromEmail: string;
  /** Reply-To address. */
  replyTo: string;
  /** Target audience — a `p_newsletter__lists.id` (composite-scoped to the workspace). */
  listId: UUID;
  /** When `scheduled`: the intended send time (ISO). Absent for immediate/draft. */
  scheduledAt: ISODateTime | null;
  /** Stamped when the send pipeline begins materializing recipients (audience freeze point). */
  sendStartedAt: ISODateTime | null;
  /** The frozen audience batch id (`p_newsletter__audience_snapshots.id`) once sending starts. */
  audienceSnapshotId: UUID | null;
  /** Denormalized delivery counters (source of truth = the sends ledger). */
  counters: CampaignCounters;
}

/** Denormalized per-campaign delivery counters (rebuildable from `p_newsletter__sends`). */
export interface CampaignCounters extends JsonObject {
  recipients: number;
  delivered: number;
  failed: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
}

/* ------------------------------------------------------------------------------------------------
 * 2. Audience + delivery — core-mediated own-tables (ADR-023 `dataModule`, `p_newsletter__*`)
 * ------------------------------------------------------------------------------------------------
 * Relational, high-volume, per-recipient state that the ext-bag cannot carry. Every row is
 * composite-scoped on `(workspace_id, id)` (ADR-021 §4 / ADR-007). Rows here are what
 * `../features/plugins/data-module` declares and core alone creates + writes (typed, ADR-023 §7).
 */

/** A named send audience. Small parent table; subscriptions FK to it. */
export interface NewsletterListRow {
  id: UUID;
  workspaceId: UUID;
  name: string;
  slug: string;
  /** True for the default "all subscribers" list seeded per workspace. */
  isDefault: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Per-subscriber-per-list subscription state. This is the newsletter-owned half of the edge. */
export type SubscriptionStatus =
  | "pending" // double opt-in requested, not yet confirmed
  | "subscribed"
  | "unsubscribed"
  | "bounced" // hard-bounce auto-suppression
  | "complained"; // spam-complaint auto-suppression

/**
 * A subscription row. `subscriberId` references a **Members-owned** subscriber principal
 * (composite `(workspace_id, subscriberId)`); Newsletter never owns the identity/email/consent —
 * see `SubscriberDirectoryPort` in `./ports.ts` and OPEN-1 (Members seam) in ADR-034.
 */
export interface SubscriptionRow {
  id: UUID;
  workspaceId: UUID;
  listId: UUID;
  /** FK into the Members-owned subscriber directory (seam — NOT designed here). */
  subscriberId: UUID;
  status: SubscriptionStatus;
  /** Source of the subscription for audit/consent provenance. */
  source: "import" | "signup_form" | "admin" | "api";
  subscribedAt: ISODateTime | null;
  unsubscribedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * A frozen recipient set captured when a campaign begins sending, so mid-send subscription
 * churn never double-sends or skips (audience freeze). One snapshot per send attempt.
 */
export interface AudienceSnapshotRow {
  id: UUID;
  workspaceId: UUID;
  campaignId: UUID;
  listId: UUID;
  recipientCount: number;
  createdAt: ISODateTime;
}

/** Per-recipient delivery lifecycle. */
export type SendStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "complained";

/**
 * One row per (campaign, subscriber) delivery attempt — the outbox-driven send ledger and the
 * source of truth for counters. `idempotencyKey` makes outbox retries safe (ADR-009 idempotent
 * handlers): a redelivery re-uses the same key so the MailerPort/provider never double-sends.
 */
export interface SendRow {
  id: UUID;
  workspaceId: UUID;
  campaignId: UUID;
  audienceSnapshotId: UUID;
  subscriberId: UUID;
  /** Frozen at snapshot time from the Members directory — the address actually sent to. */
  recipientEmail: string;
  status: SendStatus;
  attempts: number;
  /** Stable per-recipient idempotency token, also forwarded to the provider adapter. */
  idempotencyKey: string;
  /** Provider message id once accepted (for bounce/complaint correlation). */
  providerMessageId: string | null;
  lastError: string | null;
  nextAttemptAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * The ADR-023 declared-schema manifest for the newsletter own-tables. Shape-only reference so the
 * design compiles against the real `DataModuleDecl` core executes (v1 = seam; engine built later).
 */
export type NewsletterDataModule = DataModuleDecl;

/* ------------------------------------------------------------------------------------------------
 * 3. Permission catalog — flat `newsletter.*` strings (ADR-021 §3, code-side catalog)
 * ------------------------------------------------------------------------------------------------ */

export type NewsletterPermission =
  | "newsletter.read"
  | "newsletter.campaign.compose"
  | "newsletter.campaign.schedule"
  | "newsletter.campaign.send" // the dangerous one — real outbound mail; separate from compose
  | "newsletter.campaign.send_test"
  | "newsletter.list.manage"
  | "newsletter.subscriber.read"
  | "newsletter.subscriber.manage" // PII-sensitive; import/add/remove; relates to Members
  | "newsletter.settings.manage"
  | "newsletter.manage"; // umbrella

/** Registered catalog (declaration, not logic) — enumerable via `tovu permissions list` (ADR-021). */
export const NEWSLETTER_PERMISSIONS: readonly NewsletterPermission[] = [
  "newsletter.read",
  "newsletter.campaign.compose",
  "newsletter.campaign.schedule",
  "newsletter.campaign.send",
  "newsletter.campaign.send_test",
  "newsletter.list.manage",
  "newsletter.subscriber.read",
  "newsletter.subscriber.manage",
  "newsletter.settings.manage",
  "newsletter.manage",
] as const;

/* ------------------------------------------------------------------------------------------------
 * 4. Events (ADR-009 async / outbox) — serializable payloads only (ADR-024 §3 ABI)
 * ------------------------------------------------------------------------------------------------ */

export type NewsletterEventName =
  | "newsletter.campaign.scheduled"
  | "newsletter.campaign.send_started"
  | "newsletter.send.enqueued"
  | "newsletter.send.delivered"
  | "newsletter.send.failed"
  | "newsletter.send.bounced"
  | "newsletter.send.complained"
  | "newsletter.campaign.sent"
  | "newsletter.subscriber.unsubscribed";

export interface CampaignScheduledPayload {
  campaignId: UUID;
  listId: UUID;
  scheduledAt: ISODateTime;
}
export interface SendStartedPayload {
  campaignId: UUID;
  audienceSnapshotId: UUID;
  recipientCount: number;
}
export interface SendResultPayload {
  campaignId: UUID;
  sendId: UUID;
  subscriberId: UUID;
  providerMessageId: string | null;
}
export interface UnsubscribedPayload {
  subscriberId: UUID;
  listId: UUID;
  /** Present when the unsubscribe originated from a specific campaign's footer link. */
  campaignId: UUID | null;
}

/** Concrete DomainEvent aliases (ADR-007: every event is workspace-scoped, enforced by the type). */
export type CampaignScheduledEvent = DomainEvent<CampaignScheduledPayload>;
export type SendStartedEvent = DomainEvent<SendStartedPayload>;
export type SendResultEvent = DomainEvent<SendResultPayload>;
export type UnsubscribedEvent = DomainEvent<UnsubscribedPayload>;

/* ------------------------------------------------------------------------------------------------
 * 5. Hooks (ADR-009 sync/ordered extension) — value-transforming, unlike events
 * ------------------------------------------------------------------------------------------------ */

export type NewsletterHookName =
  | "newsletter.email.beforeSend" // transform the rendered message (footer/unsub/UTM injection)
  | "newsletter.recipient.filter"; // suppress a recipient (suppression lists, per-plugin rules)

/** Passed to `newsletter.email.beforeSend` — returns a possibly-transformed message. */
export interface BeforeSendHookContext {
  workspaceId: UUID;
  campaignId: UUID;
  sendId: UUID;
  subscriberId: UUID;
}

/** Passed to `newsletter.recipient.filter` — returns `true` to keep the recipient. */
export interface RecipientFilterContext {
  workspaceId: UUID;
  campaignId: UUID;
  listId: UUID;
  subscriberId: UUID;
  recipientEmail: string;
  status: SubscriptionStatus;
}

/* ------------------------------------------------------------------------------------------------
 * 6. Unsubscribe token — signed, cookie-less, no-login (ADR-020/025/027 origin isolation lineage)
 * ------------------------------------------------------------------------------------------------ */

/** The claims an unsubscribe link carries; core signs (HMAC) and verifies. Never a session cookie. */
export interface UnsubscribeTokenClaims {
  workspaceId: UUID;
  subscriberId: UUID;
  listId: UUID;
  campaignId: UUID | null;
  /** Short expiry is optional for unsubscribe (links live in old inboxes); default = non-expiring. */
  expiresAt: ISODateTime | null;
}
