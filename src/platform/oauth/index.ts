/**
 * @file Public surface of Tovu's generic OAuth 2.0 client.
 *
 * Everything here is provider-agnostic and knows nothing about MCP, connectors, or any vendor. The
 * first consumer is `assistant/external-mcp-oauth.ts`; a second consumer should be able to use this
 * module without changing it.
 *
 * `ports.ts` carries the argument for why this is not the connectors/Composio subsystem, and which
 * parts of that subsystem ARE reused (its hardened edges, not its state machine).
 */

export type {
  OAuthClient,
  OAuthClientAuthMethod,
  OAuthClock,
  OAuthFetch,
  OAuthGrantKind,
  OAuthProviderDescriptor,
  OAuthRandomBytes,
  OAuthTokenSet,
} from "./ports.js";

export { isOAuthError, mapProviderErrorCode, OAuthError } from "./errors.js";
export type { OAuthErrorCode, OAuthErrorOptions } from "./errors.js";

export { assertValidCodeVerifier, createPkcePair, deriveCodeChallenge } from "./pkce.js";
export type { PkcePair } from "./pkce.js";

export { createPendingAuthorizationStore } from "./pending-authorizations.js";
export type { PendingAuthorization, PendingAuthorizationStore, PendingAuthorizationStoreDeps } from "./pending-authorizations.js";

export { assertSafeProviderEndpoint, assertSafeUserFacingUrl } from "./endpoint-safety.js";

export { MAX_OAUTH_RESPONSE_BYTES } from "./bounded-json.js";

export {
  discoverAuthorizationServer,
  discoverProtectedResourceMetadata,
  fetchAuthorizationServerMetadata,
  parseResourceMetadataUrl,
  parseWwwAuthenticateScopes,
} from "./discovery.js";
export type {
  DiscoverAuthorizationServerInput,
  DiscoveredAuthorizationServer,
  DiscoveredOAuthConfiguration,
  DiscoveredProtectedResource,
  OAuthDiscoveryDeps,
} from "./discovery.js";

export { registerOAuthClientDynamically } from "./dynamic-registration.js";
export type {
  DynamicClientRegistrationDeps,
  DynamicClientRegistrationInput,
  RegisteredOAuthClient,
} from "./dynamic-registration.js";

export { DEFAULT_TOKEN_REQUEST_TIMEOUT_MS, requestOAuthToken } from "./token-endpoint.js";
export type { TokenRequestDeps, TokenRequestInput } from "./token-endpoint.js";

export { beginAuthorizationCode, completeAuthorizationCode } from "./authorization-code.js";
export type {
  AuthorizationCallbackParams,
  BeginAuthorizationCodeDeps,
  BeginAuthorizationCodeInput,
  BeginAuthorizationCodeResult,
  CompleteAuthorizationCodeDeps,
  CompleteAuthorizationCodeInput,
} from "./authorization-code.js";

export { beginDeviceAuthorization, pollDeviceAuthorizationOnce } from "./device-code.js";
export type {
  BeginDeviceAuthorizationInput,
  DeviceAuthorization,
  DeviceAuthorizationDeps,
  PollDeviceAuthorizationInput,
} from "./device-code.js";

export { createTokenRefresher, isTokenDueForRefresh } from "./token-refresh.js";
export type { TokenRefresher, TokenRefresherDeps, TokenRefreshPort } from "./token-refresh.js";

export {
  assertValidOAuthProvider,
  buildOperatorOAuthProvider,
  EXAMPLE_GENERIC_OIDC_PROVIDER,
  getOAuthProvider,
  listOAuthProviders,
  registerOAuthProvider,
} from "./providers.js";
export type { OperatorOAuthProviderInput } from "./providers.js";
