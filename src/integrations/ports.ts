/**
 * @file Port contracts introduced by the `integrations` library (ADR-036).
 *
 * Purpose:
 * The dependency-inversion seams webhook delivery needs. Each port here passes the ADR-006
 * rule-of-two (two plausible adapters, one built now); dispatch itself is deliberately NOT a
 * port — it is ordinary core code on the outbox spine (ADR-006 features-not-ports; ADR-009
 * rejected a mediator layer), exactly as ADR-021's `authorize()` is core code, not a port.
 *
 * How it relates to the project:
 * - `HttpClientPort` is the outbound transport (tovu-v2-design §3.5 names it a core port).
 * - `KeyringPort` / `SecretSealerPort` keep secret material out of the portable `content.db`
 *   (ADR-024 secret invariant; ADR-012 install-dir portability).
 * - The repo ports mirror the existing `OutboxPort` / `ChangeSetRepoPort` shape and are
 *   workspace-scoped in their required-parameters object (ADR-007 §1).
 *
 * Architectural role:
 * INTERFACES ONLY. In-memory adapters back local dev/tests; the SQLite/undici adapters are the
 * production second half of each rule-of-two.
 */
import type { ISODateTime, UUID } from "../core/ports";
import type {
  IntegrationId,
  IntegrationSecretRecord,
  SealedSecret,
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookSubscriptionRecord,
  WebhookTopic,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Outbound transport (rule-of-two: undici/fetch adapter now + test-double)   */
/* -------------------------------------------------------------------------- */

export interface HttpRequest {
  method: "POST" | "GET" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Readonly<Record<string, string>>;
  /** Raw request body exactly as signed — the signer signs these bytes, so no re-serialization. */
  body?: string;
  /** Hard per-attempt timeout (ms). The worker, not the adapter, owns retry/backoff. */
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  /** Truncated response body captured for delivery diagnostics (bounded by the egress policy). */
  bodyText: string;
}

/**
 * Outbound HTTP as a port so it is mockable, rate-limitable, and — critically — routed through
 * one SSRF-guarded chokepoint. Adapters MUST enforce {@link WebhookEgressPolicy} (resolve-then-
 * connect IP pinning, redirect re-verification), the egress analog of ADR-027 §6's
 * `MediaIngressPolicy`. A transport failure rejects; a non-2xx resolves normally (the worker
 * decides retry from the status), so egress-policy violations are the only throw path.
 */
export interface HttpClientPort {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * SSRF / abuse policy every outbound request is checked against before connecting. Mirrors
 * ADR-027 §6 in the egress direction. Not a port — a value object the `HttpClientPort` adapter
 * consults — but typed here so the contract is explicit and testable.
 */
export interface WebhookEgressPolicy {
  /** Allowed URL schemes. Default `['https:']`; `http:` only for an explicitly allowed dev host. */
  readonly allowedSchemes: readonly string[];
  /** Deny RFC1918 / link-local / loopback / metadata (169.254.169.254) after DNS resolution. */
  readonly denyPrivateAddresses: boolean;
  /** Allow-list of hosts exempt from {@link denyPrivateAddresses} (self-hosted localhost testing). */
  readonly devHostAllowlist: readonly string[];
  readonly maxRedirects: number;
  readonly connectTimeoutMs: number;
  readonly maxResponseBytes: number;
}

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
}

/**
 * Seals/opens recoverable outbound credentials (unlike signing secrets, these must round-trip).
 * Rule-of-two: a real AEAD adapter (libsodium/AES-GCM) built now + an in-memory test double.
 * Wrapping is always under a {@link KeyringPort} root key, so `content.db` holds only ciphertext.
 */
export interface SecretSealerPort {
  seal(input: { plaintext: string; key: RootKeyHandle }): Promise<SealedSecret>;
  open(input: { sealed: SealedSecret }): Promise<string>;
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
 * {@link import("../core/ports").OutboxPort}) but a distinct table so per-endpoint retry state
 * stays off the core event outbox (ADR-036 §4).
 */
export interface WebhookDeliveryRepoPort {
  enqueue(record: WebhookDeliveryRecord): Promise<void>;
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
