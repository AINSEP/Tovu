/**
 * @file OAuth value contracts re-exported from `@jini-ai/oauth`.
 * The definitions belong to Jini/packages/oauth/src/ports.ts.
 *
 * `authorization_code` (PKCE, RFC 7636) and `device_code` (RFC 8628) are first-class
 * grants. Self-hosted installs may lack a reachable callback; device grant also works
 * in chat because there is no redirect return leg. Self-hosted clients usually cannot
 * keep a client secret, so public-client authentication relies on PKCE.
 *
 * Provider responses, verification URLs, scope strings and errors are untrusted input;
 * flows validate them before persistence, rendering or model use. Endpoint safety and
 * provider-id stability are documented at this module's `index.ts` boundary.
 *
 * Client authentication method travels with credentials so each grant sends a secret
 * consistently in the body, header or nowhere. Token expiry is an absolute instant:
 * a persisted relative lifetime would need the issue instant to remain meaningful.
 * `refreshToken: null` forces callers to handle providers without refresh; expiry then
 * requires reauthorization. Missing scope defaults may legitimately be empty because
 * providers can infer scope. Provider PKCE quirks remain descriptor data.
 *
 * Production HTTP requires guarded OAuth ports and canonical `Clock.nowMs()`; ISO
 * timestamps are derived with `nowIso({ clock })`. Native recording doubles preserve
 * request options, including redirect refusal. The entropy seam makes tests deterministic
 * without weakening production `node:crypto` randomness.
 */

export type { OAuthClient, OAuthClientAuthMethod, OAuthFetch, OAuthGrantKind, OAuthProviderDescriptor, OAuthRandomBytes, OAuthTokenSet } from "@jini-ai/oauth";
