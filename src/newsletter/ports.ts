/**
 * @file Newsletter — port contracts (INTERFACES & TYPES ONLY; no adapter logic).
 *
 * Draft ADR-034 (PROPOSED). Two seams are declared here:
 *
 *  1. `MailerPort` — the **Tier-2 core primitive** (tovu-v2-design.md §3.5: `wp-root mail →
 *     MailerPort`; ADR-024's named core-mediated "mail adapter"). Rule-of-two (ADR-006):
 *     `SmtpMailerAdapter` (built now) + `HttpApiMailerAdapter` (provider HTTP — Resend/Postmark/
 *     SES over `HttpClientPort`, named-next) + an in-memory capture double for tests. This mirrors
 *     ADR-027's `ImageTransformPort` framing (real worker adapter + test-double = honest two).
 *
 *     IMPORTANT (ADR-024 §3): the Newsletter *plugin* never holds a live `MailerPort` object. The
 *     plugin submits send intent as data (through the outbox/command spine); **core** injects and
 *     calls the `MailerPort`. The port lives in core's DI graph, not across the plugin ABI.
 *
 *  2. `SubscriberDirectoryPort` — the **Members seam** (Members is designed in parallel; NOT here).
 *     Newsletter depends on this read port to resolve a subscriber's address/consent at audience
 *     materialization; Members owns the implementation. Rule-of-two: Members-backed adapter +
 *     in-memory test double. Declaring it as a typed contract is how ADR-034 "notes the seam".
 *
 * Grounding imports (typecheck against real code): `../core/ports`.
 */
import type { ISODateTime, UUID } from "../core/ports";

/* ------------------------------------------------------------------------------------------------
 * MailerPort — Tier-2 core mail primitive (ADR-006 rule-of-two)
 * ------------------------------------------------------------------------------------------------ */

/** A single outbound message. Serializable-only (ADR-024 §3) — no streams, no live handles. */
export interface OutboundEmail {
  /** Workspace boundary (ADR-007) — required on every send. */
  workspaceId: UUID;
  to: EmailAddress;
  from: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  /** Rendered HTML body (post-`beforeSend` hook). */
  html: string;
  /** Plain-text alternative (deliverability + accessibility). */
  text: string;
  /**
   * Additional headers. Newsletter always sets `List-Unsubscribe` +
   * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) here.
   */
  headers?: Readonly<Record<string, string>>;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

/**
 * Idempotency + provenance for a send. The `idempotencyKey` is forwarded to providers that
 * support it so an outbox retry (ADR-009) can never double-deliver.
 */
export interface MailerSendOptions {
  idempotencyKey: string;
  /** Attribution stamp (ADR-024): which plugin/campaign asked core to send. */
  originPluginId: string;
  campaignId?: UUID;
}

/** The result of one send attempt — plain serializable data (no thrown live objects across ABI). */
export type MailerSendResult =
  | { ok: true; providerMessageId: string; acceptedAt: ISODateTime }
  | { ok: false; retryable: boolean; errorCode: string; message: string };

/** Static description of an adapter's capabilities (mirrors ADR-027's `BlobStorePort.capabilities`). */
export interface MailerCapabilities {
  /** Adapter identifier, e.g. `smtp`, `resend`, `memory`. */
  driver: string;
  /** Whether the provider honours a forwarded idempotency key. */
  supportsIdempotencyKey: boolean;
  /** Whether the provider emits async bounce/complaint webhooks (else newsletter infers from SMTP). */
  supportsWebhookFeedback: boolean;
  /** Max recipients per call for `sendBatch` (1 ⇒ per-recipient only). */
  maxBatchSize: number;
}

/**
 * The mail port. Two real adapters (SMTP now, provider-HTTP next) + a test double satisfy ADR-006.
 * Batch sending is optional sugar over `send`; the outbox worker fans out per-recipient by default.
 */
export interface MailerPort {
  capabilities(): MailerCapabilities;
  send(message: OutboundEmail, opts: MailerSendOptions): Promise<MailerSendResult>;
  sendBatch?(
    messages: readonly OutboundEmail[],
    opts: MailerSendOptions
  ): Promise<readonly MailerSendResult[]>;
}

/**
 * Provider-emitted delivery feedback (bounce/complaint/delivery), normalized across adapters.
 * Ingested at a signed webhook endpoint; drives auto-suppression of subscriptions.
 */
export interface MailerFeedbackEvent {
  workspaceId: UUID;
  providerMessageId: string;
  kind: "delivered" | "bounced" | "complained";
  /** hard-bounce vs soft-bounce distinction where the provider supplies it. */
  hardBounce: boolean;
  occurredAt: ISODateTime;
}

/** Marker types documenting the concrete adapters (implemented as classes elsewhere, not here). */
export type SmtpMailerAdapter = MailerPort; // built now (nodemailer/SMTP)
export type HttpApiMailerAdapter = MailerPort; // named-next (Resend/Postmark/SES over HttpClientPort)
export type InMemoryMailerAdapter = MailerPort; // test double (captures sends)

/* ------------------------------------------------------------------------------------------------
 * SubscriberDirectoryPort — the Members seam (READ-only; Members owns the write side)
 * ------------------------------------------------------------------------------------------------ */

/** The subset of a Members-owned subscriber that Newsletter needs at send time. */
export interface SubscriberContact {
  subscriberId: UUID;
  workspaceId: UUID;
  email: string;
  /** Members-owned consent/lifecycle flag; a `false` here suppresses regardless of subscription. */
  emailDeliverable: boolean;
}

/**
 * Read port into Members. Newsletter NEVER writes subscriber identity/consent through this — it
 * only resolves contact info to freeze into the audience snapshot. Composite `(workspaceId, id)`
 * scoping (ADR-021 §4) is honoured by every method taking `workspaceId` explicitly (ADR-007).
 *
 * Implementations (rule-of-two, ADR-006): `MembersSubscriberDirectory` (real, when Members ships)
 * + `InMemorySubscriberDirectory` (test double / interim). Until Members lands, the interim double
 * is the v1 seam — see ADR-034 OPEN-1.
 */
export interface SubscriberDirectoryPort {
  getContact(required: {
    workspaceId: UUID;
    subscriberId: UUID;
  }): Promise<SubscriberContact | null>;
  getContacts(required: {
    workspaceId: UUID;
    subscriberIds: readonly UUID[];
  }): Promise<readonly SubscriberContact[]>;
}

/* ------------------------------------------------------------------------------------------------
 * Send-pipeline job payload (ADR-009 outbox spine) — serializable job the worker claims
 * ------------------------------------------------------------------------------------------------ */

/** The unit of work the outbox worker claims to drive one batch of a campaign's fan-out. */
export interface SendBatchJob {
  workspaceId: UUID;
  campaignId: UUID;
  audienceSnapshotId: UUID;
  /** The slice of `p_newsletter__sends` rows (by id) this job attempts. */
  sendIds: readonly UUID[];
}
