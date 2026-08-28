/**
 * @file Port contracts introduced by the `integrations` library (ADR-036).
 *
 * Purpose:
 * The dependency-inversion seams webhook delivery needs. `HttpClientPort`/`EgressPolicy` are
 * imported from the shared `../http` core primitive (ADR-038) — Round-3 audit fold
 * (TM-admin-sweep-001): these were previously declared locally here, but Newsletter's
 * `HttpApiMailerAdapter` and Analytics' `ForwardingSink` also need the same SSRF-guarded
 * client, so the port + policy moved to a shared home. Dispatch itself is deliberately NOT a
 * port — it is ordinary core code on the outbox spine (ADR-006 features-not-ports; ADR-009
 * rejected a mediator layer), exactly as ADR-021's `authorize()` is core code, not a port.
 *
 * How it relates to the project:
 * - `KeyringPort` / `SecretSealerPort` keep secret material out of the portable `content.db`
 *   (ADR-024 secret invariant; ADR-012 install-dir portability). Per the ADR-036 Round-3 fold,
 *   this is the canonical home for `KeyringPort` until a dedicated ADR-041 is written — other
 *   consumers (Newsletter's unsubscribe token, Analytics' salt derivation) use the generic
 *   `derive()` method (Round-4 audit fold) rather than the webhook-specific
 *   `deriveSigningSecret()`.
 * - The repo ports mirror the existing `OutboxPort` / `ChangeSetRepoPort` shape and are
 *   workspace-scoped in their required-parameters object (ADR-007 §1).
 *
 * Architectural role:
 * INTERFACES ONLY. In-memory adapters back local dev/tests; the SQLite/undici adapters are the
 * production second half of each rule-of-two.
 */
import type { ISODateTime, UUID } from "@jini-ai/cms/core";
import type { EgressPolicy, HttpClientPort } from "../../platform/http/index.js";
import type {
  IntegrationId,
  IntegrationSecretRecord,
  SealedSecret,
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookEventEnvelope,
  WebhookSubscriptionRecord,
  WebhookTopic,
} from "./types.js";

export type { EgressPolicy, HttpClientPort, HttpRequest, HttpResponse } from "../../platform/http/index.js";

/* -------------------------------------------------------------------------- */
/* Secret material — kept OUT of the portable content.db                       */
/* -------------------------------------------------------------------------- */

/** Opaque root-key handle. The raw bytes never cross the SDK/ABI surface (ADR-024 §3 by-handle). */
export interface RootKeyHandle {
  /** Names the active root-key generation, stamped into {@link SealedSecret.keyId}. */
  readonly keyId: string;
}

/**
 * Access to the install's root key, held OUTSIDE `content.db` (env var now → OS keychain next =
 * rule-of-two), so the portable folder never carries usable secret material (ADR-024 secret
 * invariant). Signing secrets are DERIVED from it (never stored): the delivery worker calls
 * {@link deriveSigningSecret} at sign time. Rotating the root key re-derives all signing secrets
 * (receivers must re-copy) and is the trigger for a sealed-secret rewrap on export.
 */
export interface KeyringPort {
  activeKey(): Promise<RootKeyHandle>;
  /**
   * HKDF(rootKey, info = `${workspaceId}:${subscriptionId}:v${version}`) → raw signing secret.
   * Deterministic for a fixed root key, so no per-subscription secret is ever persisted.
   */
  deriveSigningSecret(input: {
    workspaceId: UUID;
    subscriptionId: IntegrationId;
    version: number;
  }): Promise<Uint8Array>;
  /**
   * Generic labeled derivation for crosscutting consumers whose payload doesn't fit
   * {@link deriveSigningSecret}'s webhook-specific shape (Round-4 audit fold, TM-admin-sweep-001 —
   * round-2 re-audit finding `gemini-r2-001`/Codex `R2-002`/Fable `R2-002`: three independent
   * auditors converged on the same gap — `deriveSigningSecret`'s fixed `subscriptionId`/`version`
   * fields can't express Analytics' `analytics-salt:{workspaceId}:{utcDate}` info string or
   * Newsletter's unsubscribe-token info string, which must include `consent_revision_id`).
   * `purpose` namespaces the caller (e.g. `'analytics-salt'`, `'newsletter-unsubscribe'`); `info`
   * is the caller-owned, fully-formed HKDF info string. Same root-key custody guarantee as
   * `deriveSigningSecret` — no raw key material crosses this interface, only derived output.
   * **Implementations MUST bind `purpose` into the derivation** (e.g. effective HKDF info =
   * `${purpose}:${info}`, or `purpose` as the HKDF salt/label) and MUST keep `derive()`
   * domain-separated from `deriveSigningSecret()`'s derivation — round-3 audit finding
   * `fable-r3-003`: as originally worded, a conforming implementation could HKDF over `info`
   * alone, making `purpose` decorative rather than a real separation boundary.
   */
  derive(input: { workspaceId: UUID; purpose: string; info: string }): Promise<Uint8Array>;
}

/**
 * Seals/opens recoverable outbound credentials (unlike signing secrets, these must round-trip).
 * Rule-of-two: a real AEAD adapter (libsodium/AES-GCM) built now + an in-memory test double.
 * Wrapping is always under a {@link KeyringPort} root key, so `content.db` holds only ciphertext.
 *
 * `aad` (Additional Authenticated Data, AES-GCM's own mechanism — RFC 5116 §5.1) is OPTIONAL and
 * backward compatible: every caller that predates it (`site-credential-store.ts`,
 * `execution-credential-store.ts`, `provider-credential-store.ts` — all three sealing into rows with
 * NO AAD) keeps sealing/opening exactly as before. A caller that DOES pass `aad` at seal time MUST
 * pass the byte-identical string at open time, or `open()` throws (auth-tag verification fails) —
 * this is what makes ciphertext non-transplantable across whatever scope `aad` encodes (e.g. a
 * `workspaceId + providerId + credentialSetId` binding — see
 * `features/deployments/publish-credentials/aad.ts`), without changing `SealedSecret`'s own shape:
 * AAD is authenticated but never encrypted or persisted by GCM, so a caller must always be able to
 * RE-DERIVE the same `aad` string from context at open time — it is not something to store alongside
 * the ciphertext.
 */
export interface SecretSealerPort {
  seal(input: { plaintext: string; key: RootKeyHandle; aad?: string }): Promise<SealedSecret>;
  open(input: { sealed: SealedSecret; aad?: string }): Promise<string>;
}

/* -------------------------------------------------------------------------- */
/* Repositories (workspace-scoped, ADR-007 §1; mirror OutboxPort shape)        */
/* -------------------------------------------------------------------------- */

/** Persistence for webhook subscriptions. Every method carries `workspaceId` (ADR-007 §1). */
export interface WebhookSubscriptionRepoPort {
  insert(record: WebhookSubscriptionRecord): Promise<void>;
  save(record: WebhookSubscriptionRecord): Promise<void>;
  findById(required: { workspaceId: UUID; id: IntegrationId }): Promise<WebhookSubscriptionRecord | null>;
  listByWorkspace(required: { workspaceId: UUID }): Promise<WebhookSubscriptionRecord[]>;
  /**
   * Active subscriptions whose topic set matches a delivered event. Used by the outbox fan-out
   * subscriber to decide which deliveries to enqueue (ADR-036 §4).
   */
  findMatching(required: { workspaceId: UUID; topic: WebhookTopic }): Promise<WebhookSubscriptionRecord[]>;
}

/**
 * Persistence for webhook deliveries — an outbox-shaped claim/mark contract (mirrors
 * {@link import("@jini-ai/cms/core").OutboxPort}) but a distinct table so per-endpoint retry state
 * stays off the core event outbox (ADR-036 §4).
 */
export interface WebhookDeliveryRepoPort {
  /**
   * `envelope`, when present, may be durably co-persisted atomically with `record` (ADR-046
   * fold-in item 5, GAP-05/GAP-12). Purely additive — existing single-argument callers are
   * unaffected. A durable adapter that writes it inline makes the subsequent
   * `DeliveryEnvelopeStore.save()` call (see `delivery.ts`'s `enqueueDelivery`) redundant but
   * harmless for its own storage; an adapter that ignores this argument relies on that same
   * `save()` call as its actual write path (true for the in-memory adapter today).
   */
  enqueue(record: WebhookDeliveryRecord, envelope?: WebhookEventEnvelope): Promise<void>;
  /** Claim due, retry-eligible rows for a delivery worker pass. */
  claimPending(required: { batchSize: number; nowIso: ISODateTime }): Promise<WebhookDeliveryRecord[]>;
  markDelivered(required: {
    workspaceId: UUID;
    id: IntegrationId;
    responseStatus: number;
    deliveredAtIso: ISODateTime;
  }): Promise<void>;
  /** Record a failed attempt; sets the next backoff time, or transitions to `dead` when exhausted. */
  markFailed(required: {
    workspaceId: UUID;
    id: IntegrationId;
    error: string;
    responseStatus: number | null;
    nextStatus: Extract<WebhookDeliveryStatus, "failed" | "dead">;
    nextAttemptAt: ISODateTime;
    deadAtIso?: ISODateTime;
  }): Promise<void>;
  findById(required: { workspaceId: UUID; id: IntegrationId }): Promise<WebhookDeliveryRecord | null>;
  listBySubscription(required: {
    workspaceId: UUID;
    subscriptionId: IntegrationId;
    limit: number;
  }): Promise<WebhookDeliveryRecord[]>;
}

/** Persistence for sealed outbound-integration credentials (v1 = seam only, ADR-036 §8). */
export interface IntegrationSecretRepoPort {
  insert(record: IntegrationSecretRecord): Promise<void>;
  findById(required: { workspaceId: UUID; id: IntegrationId }): Promise<IntegrationSecretRecord | null>;
  listByWorkspace(required: { workspaceId: UUID }): Promise<IntegrationSecretRecord[]>;
  delete(required: { workspaceId: UUID; id: IntegrationId }): Promise<void>;
}
