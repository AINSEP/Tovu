export type { SealedSecret } from "@jini-ai/platform/secrets";
/**
 * @file Public surface of the `integrations` Tier-2 core library (ADR-036).
 *
 * Barrel exports only. Boundary lint forbids deep imports into this library — consumers
 * (the delivery worker, admin routes, AI tools) depend on `integrations` via this index
 * (ADR-009 §1: a module's public surface is its `index.ts`).
 *
 * v1 exports the type + port seams; the delivery worker, repos, signer, and handlers land
 * against these contracts in the Implementation Proposal phases (see the design report).
 */
export type {
  IntegrationId,
  IntegrationSecretRecord,
  SecretVersion,
  WebhookBeforeDispatchHook,
  WebhookBeforeDispatchResult,
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookEventEnvelope,
  WebhookSignature,
  WebhookSubscriptionRecord,
  WebhookSubscriptionStatus,
  WebhookTopic,
} from "@jini-ai/integrations/webhooks";

export type {
  IntegrationSecretRepoPort,
  SiteKeyHandle,
  WebhookDeliveryRepoPort,
  WebhookSubscriptionRepoPort,
} from "./ports.js";

// `HttpClientPort`/`EgressPolicy` are the shared `../http` core primitive (ADR-038) — re-exported
// here (via `./ports`) so existing `integrations` consumers don't need to know the type moved.
export type { EgressPolicy, HttpClientPort, HttpRequest, HttpResponse } from "./ports.js";

// Subscription CRUD write-service (ADR-036 §6): its first landed consumer was the admin HTTP API
// (the integrations admin routes). It now lives at `@jini-ai/integrations/webhooks/site/subscriptions`,
// and the routes, the delivery worker and AI tools import it from there (no re-export shell here).

// In-memory repo adapters (the local-dev/test half of each ADR-006 rule-of-two), exported here so the
// admin HTTP API and its tests reach them through this index.
export {
  InMemoryDeliveryEnvelopeStore,
  InMemoryWebhookDeliveryRepo,
  InMemoryWebhookSubscriptionRepo,
} from "./repo.memory.js";
export type { DeliveryEnvelopeStore } from "./repo.memory.js";

// ADR-046 Phase 1 (2026-07-16): the ADR-006 rule-of-two "second adapter" half — contract-tested at
// `db/sqlite/__tests__/webhook-*-repo.sqlite.test.ts` and wired into the real composition root at
// `apps/website/src/server/runtime/composition/deps.ts`. Relocated to `db/sqlite/webhook-repo.sqlite.ts`
// (2026-08-17, architecture SCC cut: `integrations → db` concentrated entirely in this concrete
// adapter) and DELIBERATELY not re-exported here — re-exporting it through this barrel would
// reintroduce the same edge the move was for. The composition root imports it directly from
// `db/sqlite`, same as every other outer-layer SQLite adapter (`vendor-credential-repo.sqlite.ts`
// et al.).

export {
  isSiteIdToken, readSiteMetaId, readSiteMetaJson, resolveSiteKeyFingerprint,
  resolveSiteKeyId, siteKeyFilePathFrom, siteKeySources, siteKeySourcesForSiteDir,
  type SiteKeySource,
} from "./site-key-sources.js";
export {
  fingerprintSiteKeyHex, generateFileSiteKey, inspectSiteKeyMaterial, isNoSiteKeyError, parseSiteKeyHex,
  revealSiteKeyMaterial, SiteKeyFileAlreadyExistsError, type SiteKeyStatus,
} from "./keyring.env.js";

export { InMemoryKeyring } from "./keyring.memory.js";
export { AesGcmSecretSealer } from "./secret-sealer.aesgcm.js";
