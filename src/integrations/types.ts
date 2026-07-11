/**
 * @file Core type definitions and row shapes for the `integrations` library (ADR-036).
 *
 * Purpose:
 * The webhook subsystem's durable state (subscriptions + deliveries) and the on-the-wire
 * shapes (outbound event envelope + signature). API keys are NOT redefined here — they are
 * owned by `identity` (ADR-021 `api_keys`); this library only *references* a key's principal.
 *
 * How it relates to the project:
 * - `integrations` is a Tier-2 core library (tovu-v2-design §3.5) built on the outbox spine
 *   (ADR-009): a domain event delivered by the outbox fans out to matching `webhook_subscriptions`,
 *   each producing a `webhook_deliveries` row that a delivery worker signs and POSTs.
 * - Rows are workspace-scoped (ADR-007) and ULID-keyed; writes go through one chokepoint (ADR-022 §4a).
 * - These are INTERFACES/TYPES ONLY — no feature logic. Adapters/handlers implement them later.
 *
 * Architectural role:
 * The stable type seam the delivery worker, repos, admin surface, and AI tools all depend on.
 * Webhook *tables are core-owned* (like ADR-027's `asset_blobs` sidecars / ADR-028's settings
 * tables), NOT ADR-023 plugin data modules — that path is for third-party integration plugins.
 */
import type { DomainEvent, ISODateTime, JsonObject, UUID } from "../core/ports";

/**
 * A subscribable event topic. The topic namespace IS the domain-event name namespace
 * (`{entity}.{action}`, e.g. `post.published`) — webhooks are just external subscribers to the
 * same catalog the in-process bus consumes (ADR-009 §2; Shopify-webhooks reconstruction note).
 * A trailing `.*` requests every action for an entity; `*` (owner-scoped) requests all topics.
 */
export type WebhookTopic = string;

/** ULID for an integrations-owned row. Aliased for intent; ADR-022 §4c stable identity. */
export type IntegrationId = UUID;

/**
 * Monotonic signing-secret generation for one subscription. Rotation mints `version + 1` and
 * both versions sign during an overlap window (ADR-036 §4). The secret itself is never stored —
 * it is HKDF-derived from the install root key + subscriptionId + version (ADR-036 §9).
 */
export type SecretVersion = number;

export type WebhookSubscriptionStatus = "active" | "paused" | "disabled";

/**
 * Durable header for one outbound webhook subscription (core-owned table `webhook_subscriptions`).
 * Composite `(workspace_id, id)` isolation per ADR-007/ADR-021 §4; no plaintext secret is stored —
 * only the current `secretVersion` (the material is derived at sign time).
 */
export interface WebhookSubscriptionRecord {
  id: IntegrationId;
  workspaceId: UUID;
  /**
   * Principal that owns this subscription (ADR-021). For a subscription created via an API key
   * this is the key's `kind='api_key'` principal; the delivery inherits no more reach than the
   * owner holds. Composite-FK isolated (ADR-021 §4).
   */
  ownerPrincipalId: UUID;
  /** Human/AI-facing label shown in the admin surface. */
  label: string;
  /** Absolute https target. Validated against {@link EgressPolicy} (`../http`) before every delivery. */
  targetUrl: string;
  /**
   * Topics this subscription matches. Empty = matches nothing (fail-closed). Each entry is a
   * catalog-validated topic; `*` is owner-only (ADR-021 §3 wildcard semantics reused).
   */
  topics: readonly WebhookTopic[];
  /** Current signing-secret generation (ADR-036 §4). The material is derived, never stored. */
  secretVersion: SecretVersion;
  /**
   * Prior generation still honored during a rotation overlap window, so a receiver can migrate
   * without dropped deliveries. Null outside a rotation.
   */
  previousSecretVersion: SecretVersion | null;
  status: WebhookSubscriptionStatus;
  /** Originating actor/plugin attribution stamped at the write chokepoint (ADR-022 amend / ADR-024). */
  createdByPrincipalId: UUID;
  createdByPluginId: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Set (never row-deleted) when disabled, for audit durability (ADR-021 §5 lineage). */
  disabledAt: ISODateTime | null;
}

/**
 * Delivery lifecycle. `pending → delivering → delivered | failed`; `failed` re-enters `pending`
 * until attempts are exhausted, then `dead` (dead-letter, ADR-009 consequences). `canceled` when
 * the subscription is deleted mid-flight.
 */
export type WebhookDeliveryStatus =
  | "pending"
  | "delivering"
  | "delivered"
  | "failed"
  | "dead"
  | "canceled";

/**
 * One outbound delivery attempt-group: the join of a single delivered domain event to a single
 * matching subscription (core-owned table `webhook_deliveries`). This is an outbox-SHAPED table
 * (mirrors {@link import("../core/ports").OutboxRecord }) but deliberately distinct from the core
 * event outbox: one event fans out to N endpoints, each retrying on its own backoff clock, so
 * per-endpoint HTTP retry state must not be crammed into the event outbox (ADR-036 §4).
 *
 * High-churn machine state: writes here do NOT create content revisions — this narrows ADR-022's
 * revision-per-write discipline exactly as ADR-027 §2 narrowed INV-3 for its operational sidecars.
 */
export interface WebhookDeliveryRecord {
  id: IntegrationId;
  workspaceId: UUID;
  subscriptionId: IntegrationId;
  /** The source domain event id (ADR-007 envelope). Stamped into `Tovu-Event-Id` for dedupe. */
  eventId: UUID;
  topic: WebhookTopic;
  status: WebhookDeliveryStatus;
  /** Delivery attempts so far (mirrors OutboxRecord.attempts). */
  attempts: number;
  /** Retry eligibility (exponential backoff + jitter, ADR-036 §4). */
  nextAttemptAt: ISODateTime;
  /** HTTP status of the most recent attempt, or null before the first attempt / on transport error. */
  lastResponseStatus: number | null;
  /** Most recent failure reason (transport error or non-2xx), truncated for storage. */
  lastError: string | null;
  /** Secret generation used to sign the most recent attempt (audit + receiver debugging). */
  signedWithVersion: SecretVersion | null;
  createdAt: ISODateTime;
  deliveredAt: ISODateTime | null;
  /** Set when the delivery exhausts retries and enters `dead` (dead-letter surfaced in admin). */
  deadAt: ISODateTime | null;
}

/**
 * The serializable payload POSTed to a subscriber. A projection of the internal {@link DomainEvent}
 * — never the live event object — so the outbound contract is stable and structured-clone-safe
 * (aligned with the ADR-024 §3 ABI: serializable-only, no live core objects).
 */
export interface WebhookEventEnvelope {
  /** Stable delivery id — echoed in `Tovu-Delivery-Id`; unique per (event × subscription × attempt-group). */
  deliveryId: IntegrationId;
  /** Source domain-event id — echoed in `Tovu-Event-Id`; receivers dedupe on this (at-least-once). */
  eventId: UUID;
  topic: WebhookTopic;
  workspaceId: UUID;
  /** When the source event occurred (ADR-007 envelope `occurredAt`). */
  occurredAt: ISODateTime;
  /** Event-specific data. Serializable-only; passes through {@link WebhookBeforeDispatchHook} filters. */
  data: JsonObject;
}

/**
 * The signature material carried on every request. Stripe-shaped, timestamped to bound replay:
 * `Tovu-Signature: t=<unixSeconds>,v1=<hex(HMAC-SHA256(secret, `${t}.${rawBody}`))>`.
 * During a rotation overlap the header carries both generations (`v1=…,v1=…`), letting a receiver
 * accept either while it migrates (ADR-036 §4).
 */
export interface WebhookSignature {
  /** Unix seconds; receiver rejects outside its tolerance window to defeat replay. */
  timestamp: number;
  /** One hex HMAC per honored secret generation (1 normally, 2 during rotation overlap). */
  signatures: readonly string[];
}

/**
 * Sealed outbound-integration credential (core-owned table `integration_secrets`) — e.g. a
 * third-party API token an operator pastes for an outbound connector. Unlike a signing secret
 * (derived, never stored) this MUST be recoverable to send, so it is stored **sealed** by the
 * install root key via {@link import("./ports").SecretSealerPort} and never as plaintext in the
 * portable folder (ADR-024 secret invariant). v1 = seam only (ADR-036 §8); the connector runtime
 * that consumes it is deferred.
 */
export interface IntegrationSecretRecord {
  id: IntegrationId;
  workspaceId: UUID;
  ownerPrincipalId: UUID;
  /** Logical name, e.g. `stripe.secret_key`. Non-secret; the value lives in `sealed`. */
  name: string;
  /** Ciphertext + wrapping metadata; opened only in-process via the sealer port. */
  sealed: SealedSecret;
  createdByPrincipalId: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Opaque sealed blob. `keyId` names the root-key generation the value was wrapped under, so
 * `tovu build`/export can rewrap (`--secrets=rewrap`) or strip (`--secrets=strip`, default) rather
 * than silently carrying a secret out of the folder — the egress analog of ADR-027 §A6 `--blobs`.
 */
export interface SealedSecret {
  keyId: string;
  /** Base64 AEAD ciphertext. */
  ciphertext: string;
  /** Base64 nonce/IV. */
  nonce: string;
  /** AEAD algorithm tag, e.g. `xchacha20poly1305` / `aes-256-gcm`. */
  alg: string;
}

/**
 * Async, serializable filter run before a delivery is signed and sent (ADR-009 §3 hook, shaped to
 * the ADR-024 §3 ABI: async + serializable-only). A handler may redact/transform the envelope's
 * `data` or veto the delivery (`send: false`). This is the Tier-1 declarative-webhook seam
 * (ADR-024 §1): a declarative plugin says "on topic X, POST a shaped payload to a templated URL".
 */
export interface WebhookBeforeDispatchHook {
  /** Deterministic priority; lower runs first (ADR-024 §7 — no implicit registration order). */
  readonly priority: number;
  handle(input: {
    readonly subscription: WebhookSubscriptionRecord;
    readonly envelope: WebhookEventEnvelope;
  }): Promise<WebhookBeforeDispatchResult>;
}

export interface WebhookBeforeDispatchResult {
  /** Fail-closed default is `true`; a handler returns `false` to veto this delivery. */
  readonly send: boolean;
  /** Optional replacement envelope (serializable-only). Absent = pass through unchanged. */
  readonly envelope?: WebhookEventEnvelope;
}
