/**
 * @file Canonical Jini webhook port exports with Tovu's outbound HTTP policy (ADR-036/ADR-038).
 * Webhook dispatch is core outbox orchestration, not an extra mediator/port (ADR-006/ADR-009).
 * Repo contracts are workspace-scoped; adapters own durable claims and deduplication.
 *
 * Site-key custody: raw key bytes remain outside portable content.db and never cross the SDK/ABI
 * surface (ADR-024); handles name the active generation. Signing secrets are deterministically
 * derived per workspace/subscription/version, never stored. Rotation requires receivers to
 * re-copy signing material and export to rewrap sealed credentials. Other consumers use generic
 * derive because analytics/unsubscribe contexts cannot fit the webhook-specific derivation shape.
 * purpose MUST affect HKDF and stay domain-separated from deriveSigningSecret; info alone would
 * make that namespace decorative and allow cross-purpose collisions.
 *
 * Recoverable outbound credentials are sealed under the site key; content.db holds ciphertext.
 * New seals require AAD. Opens require the byte-identical binding or authentication fails, so rows
 * cannot transplant ciphertext across workspace/provider/credential scope. GCM authenticates AAD
 * without storing it; callers re-derive it from context. Absent open AAD remains valid for old
 * unbound rows; per-store aad_version/backfill policy belongs to each credential store.
 *
 * Delivery retry state stays in a distinct table because each endpoint retries independently of
 * the source event outbox. Durable enqueue may atomically co-persist the envelope with its record;
 * delivery.ts documents why the following envelopeStore.save remains safe for both adapter forms.
 * listBySubscription orders newest-first by createdAt/id before applying the limit.
 * Integration-secret persistence is a seam for outbound connectors, not ownership of their runtime.
 */
// Canonical webhook ABI; Tovu supplies persistence and outbound HTTP policy.
export type { IntegrationSecretRepoPort, KeyringPort, RootKeyHandle as SiteKeyHandle, SecretSealerPort, WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "@jini-ai/integrations/webhooks";
export type { EgressPolicy, HttpClientPort, HttpRequest, HttpResponse } from "../../platform/http/index.js";
