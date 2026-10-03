// Implementation: /Users/la/Programming/Jini/packages/integrations/src/webhooks/types.ts
/** Host type boundary retained for excluded durable repositories; definitions live in Jini.
 *
 * Contract rationale for the Jini implementation and this host boundary:
 *
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
 *
 * A subscribable event topic. The topic namespace IS the domain-event name namespace
 * (`{entity}.{action}`, e.g. `post.published`) — webhooks are just external subscribers to the
 * same catalog the in-process bus consumes (ADR-009 §2; Shopify-webhooks reconstruction note).
 * A trailing `.*` requests every action for an entity; `*` (owner-scoped) requests all topics.
 *
 * ULID for an integrations-owned row. Aliased for intent; ADR-022 §4c stable identity.
 *
 * Monotonic signing-secret generation for one subscription. Rotation mints `version + 1` and
 * both versions sign during an overlap window (ADR-036 §4). The secret itself is never stored —
 * it is HKDF-derived from the install root key + subscriptionId + version (ADR-036 §9).
 *
 * Durable header for one outbound webhook subscription (core-owned table `webhook_subscriptions`).
 * Composite `(workspace_id, id)` isolation per ADR-007/ADR-021 §4; no plaintext secret is stored —
 * only the current `secretVersion` (the material is derived at sign time).
 *
 * Principal that owns this subscription (ADR-021). For a subscription created via an API key
 * this is the key's `kind='api_key'` principal; the delivery inherits no more reach than the
 * owner holds. Composite-FK isolated (ADR-021 §4).
 *
 * Human/AI-facing label shown in the admin surface.
 *
 * Absolute https target. Validated against {@link EgressPolicy} (`../http`) before every delivery.
 *
 * Topics this subscription matches. Empty = matches nothing (fail-closed). Each entry is a
 * catalog-validated topic; `*` is owner-only (ADR-021 §3 wildcard semantics reused).
 *
 * Current signing-secret generation (ADR-036 §4). The material is derived, never stored.
 *
 * Prior generation still honored during a rotation overlap window, so a receiver can migrate
 * without dropped deliveries. Null outside a rotation.
 *
 * Originating actor/plugin attribution stamped at the write chokepoint (ADR-022 amend / ADR-024).
 *
 * Set (never row-deleted) when disabled, for audit durability (ADR-021 §5 lineage).
 *
 * Delivery lifecycle. `pending → delivering → delivered | failed`; `failed` re-enters `pending`
 * until attempts are exhausted, then `dead` (dead-letter, ADR-009 consequences). `canceled` when
 * the subscription is deleted mid-flight.
 *
 * One outbound delivery attempt-group: the join of a single delivered domain event to a single
 * matching subscription (core-owned table `webhook_deliveries`). This is an outbox-SHAPED table
 * (mirrors {@link import("@jini-ai/cms/core").OutboxRecord }) but deliberately distinct from the core
 * event outbox: one event fans out to N endpoints, each retrying on its own backoff clock, so
 * per-endpoint HTTP retry state must not be crammed into the event outbox (ADR-036 §4).
 *
 * High-churn machine state: writes here do NOT create content revisions — this narrows ADR-022's
 * revision-per-write discipline exactly as ADR-027 §2 narrowed INV-3 for its operational sidecars.
 *
 * The source domain event id (ADR-007 envelope). Stamped into `Tovu-Event-Id` for dedupe.
 *
 * Delivery attempts so far (mirrors OutboxRecord.attempts).
 *
 * Retry eligibility (exponential backoff + jitter, ADR-036 §4).
 *
 * HTTP status of the most recent attempt, or null before the first attempt / on transport error.
 *
 * Most recent failure reason (transport error or non-2xx), truncated for storage.
 *
 * Secret generation used to sign the most recent attempt (audit + receiver debugging).
 *
 * Set when the delivery exhausts retries and enters `dead` (dead-letter surfaced in admin).
 *
 * The serializable payload POSTed to a subscriber. A projection of the internal {@link DomainEvent}
 * — never the live event object — so the outbound contract is stable and structured-clone-safe
 * (aligned with the ADR-024 §3 ABI: serializable-only, no live core objects).
 *
 * Stable delivery id — echoed in `Tovu-Delivery-Id`; unique per (event × subscription × attempt-group).
 *
 * Source domain-event id — echoed in `Tovu-Event-Id`; receivers dedupe on this (at-least-once).
 *
 * When the source event occurred (ADR-007 envelope `occurredAt`).
 *
 * Event-specific data. Serializable-only; passes through {@link WebhookBeforeDispatchHook} filters.
 *
 * The signature material carried on every request. Stripe-shaped, timestamped to bound replay:
 * `Tovu-Signature: t=<unixSeconds>,v1=<hex(HMAC-SHA256(secret, `${t}.${rawBody}`))>`.
 * During a rotation overlap the header carries both generations (`v1=…,v1=…`), letting a receiver
 * accept either while it migrates (ADR-036 §4).
 *
 * Unix seconds; receiver rejects outside its tolerance window to defeat replay.
 *
 * One hex HMAC per honored secret generation (1 normally, 2 during rotation overlap).
 *
 * Sealed outbound-integration credential (core-owned table `integration_secrets`) — e.g. a
 * third-party API token an operator pastes for an outbound connector. Unlike a signing secret
 * (derived, never stored) this MUST be recoverable to send, so it is stored **sealed** by the
 * install root key via {@link import("./ports.js").SecretSealerPort} and never as plaintext in the
 * portable folder (ADR-024 secret invariant). v1 = seam only (ADR-036 §8); the connector runtime
 * that consumes it is deferred.
 *
 * Logical name, e.g. `stripe.secret_key`. Non-secret; the value lives in `sealed`.
 *
 * Ciphertext + wrapping metadata; opened only in-process via the sealer port.
 *
 * Opaque sealed blob. `keyId` names the root-key generation the value was wrapped under, so
 * `tovu build`/export can rewrap (`--secrets=rewrap`) or strip (`--secrets=strip`, default) rather
 * than silently carrying a secret out of the folder — the egress analog of ADR-027 §A6 `--blobs`.
 *
 * Base64 AEAD ciphertext.
 *
 * Base64 nonce/IV.
 *
 * AEAD algorithm tag, e.g. `xchacha20poly1305` / `aes-256-gcm`.
 *
 * Async, serializable filter run before a delivery is signed and sent (ADR-009 §3 hook, shaped to
 * the ADR-024 §3 ABI: async + serializable-only). A handler may redact/transform the envelope's
 * `data` or veto the delivery (`send: false`). This is the Tier-1 declarative-webhook seam
 * (ADR-024 §1): a declarative plugin says "on topic X, POST a shaped payload to a templated URL".
 *
 * Deterministic priority; lower runs first (ADR-024 §7 — no implicit registration order).
 *
 * Fail-closed default is `true`; a handler returns `false` to veto this delivery.
 *
 * Optional replacement envelope (serializable-only). Absent = pass through unchanged.
 */
export type {
  IntegrationId, IntegrationSecretRecord, SecretVersion,
  WebhookBeforeDispatchHook, WebhookBeforeDispatchResult,
  WebhookDeliveryRecord, WebhookDeliveryStatus, WebhookEventEnvelope,
  WebhookSignature, WebhookSubscriptionRecord, WebhookSubscriptionStatus, WebhookTopic,
} from "@jini-ai/integrations/webhooks";
export type { SealedSecret } from "@jini-ai/platform/secrets";
