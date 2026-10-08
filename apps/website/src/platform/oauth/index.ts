/**
 * @file Canonical OAuth contracts and Tovu host policy.
 * Generic flows/store contracts belong to `@jini-ai/oauth`; Tovu supplies guarded
 * transport, issuer policy, entropy defaults and operator-facing copy.
 * Provider registry contracts live in Jini/packages/oauth/src/registry.ts.
 *
 * Host registries are per-service instances. Operator-defined providers require no
 * release: endpoint URLs and scopes describe them without putting vendor names in flows.
 * Built-in descriptors are convenience data, not an allowlist of supported providers.
 * Explicit endpoints also allow providers without discovery documents.
 *
 * Stable provider ids are persisted on connection rows, so renaming one orphans tokens.
 * Registration validates endpoint safety early to distinguish configuration mistakes
 * from provider outages; use-time checks still apply. Registering the same id replaces
 * its descriptor so deployments can override endpoint changes. Missing ids fail loudly
 * rather than leaving a connection that silently does nothing.
 *
 * Operator descriptors derive grants from supplied endpoints rather than an independent
 * checkbox that could disagree. PKCE is on for self-hosted public clients; there is no
 * operator switch to weaken it. A provider that rejects it needs an evidenced descriptor
 * change. Example/test descriptors demonstrate wiring only; real providers require
 * verification of their actual grants and refresh-token support.
 */

export type { OAuthClient, OAuthClientAuthMethod, OAuthFetch, OAuthGrantKind, OAuthProviderDescriptor, OAuthRandomBytes, OAuthTokenSet } from "./ports.js";
export { OAuthError, isOAuthError, mapProviderErrorCode } from "./errors.js";
export type { OAuthErrorCode, OAuthErrorOptions } from "./errors.js";
export {
  createPendingAuthorizationStore,
  DEFAULT_MAX_ENTRIES as PENDING_AUTHORIZATION_DEFAULT_MAX_ENTRIES,
  DEFAULT_TTL_MS as PENDING_AUTHORIZATION_DEFAULT_TTL_MS,
  invalidState as invalidPendingAuthorizationState,
  secureEquals as secureEqualsForOwnerBinding,
  STATE_BYTES as PENDING_AUTHORIZATION_STATE_BYTES,
} from "./pending-authorizations.js";
export type { PendingAuthorization, PendingAuthorizationStore, PendingAuthorizationStoreDeps } from "./pending-authorizations.js";
