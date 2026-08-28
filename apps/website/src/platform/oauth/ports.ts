import type { ISODateTime } from "@jini-ai/cms/core";

/**
 * @file The typed boundary for Tovu's GENERIC OAuth 2.0 client — provider-agnostic, and deliberately
 * knowing nothing about MCP, connectors, or any one vendor.
 *
 * ## Why this is not the connectors subsystem
 *
 * `src/platform/connectors/` already runs a working, hardened per-workspace "click to authorize" flow, and
 * its *edges* are reused verbatim by callers of this module — the public callback mount point, the
 * XSS-safe callback page (`server/routes/oauth/callback-page.ts`, extracted from
 * `routes/connectors/composio-callback.ts`), the popup + origin-checked `postMessage` bridge with
 * its focus-regain fallback, and the per-IP rate limiters. Those are the parts teams get wrong.
 *
 * What is NOT reused is the state machine, and that is a deliberate finding rather than an
 * oversight: `ComposioConnectorProvider` never performs an OAuth token exchange at all. Composio is
 * the OAuth client; Tovu asks it for a redirect URL and later asks it for a *connected account*.
 * There is no `authorization_code` grant, no PKCE, no token endpoint, no refresh token and no
 * expiry anywhere in that path (`ConnectorCredentialRow` has no `expiresAt` column precisely
 * because Composio refreshes vendor-side). A direct integration inherits all of those duties, so
 * the machine is written fresh here and kept behind {@link OAuthProviderDescriptor} so no vendor's
 * quirks leak into the caller.
 *
 * ## Two grants, both first class
 *
 * {@link OAuthGrantKind} carries `authorization_code` (with PKCE, RFC 7636) and `device_code`
 * (RFC 8628). The device grant is NOT a fallback. Tovu is self-hosted: a large share of installs
 * have no publicly reachable callback URL at all, and for those the device grant is the only
 * mechanism that can work. It is also the only one that is safe to surface inside a chat surface,
 * because it has no return leg to carry.
 *
 * ## Trust
 *
 * Everything an authorization server sends back — token payloads, `verification_uri`, error codes,
 * scope strings — is UNTRUSTED INPUT arriving from a third party over a redirect this process did
 * not originate. This file types it. Validation lives in the flow modules and is applied before any
 * of it is persisted, rendered, or handed to a model.
 *
 * Architectural role: port declarations and value types only. No I/O, no policy.
 */

/** The two grants this client implements. Neither is a fallback for the other — see the file header. */
export type OAuthGrantKind = "authorization_code" | "device_code";

/**
 * How a provider expects the client to authenticate at the token endpoint (RFC 6749 §2.3).
 *
 * `none` is the correct choice for a PUBLIC client, which is what a self-hosted Tovu install
 * usually is: it cannot keep a client secret, and PKCE is what replaces one.
 */
export type OAuthClientAuthMethod = "none" | "client_secret_post" | "client_secret_basic";

/**
 * One authorization server, described in provider-agnostic terms.
 *
 * Every endpoint is a plain absolute URL rather than a discovery document: an operator connecting a
 * server that publishes no `.well-known/oauth-authorization-server` must still be able to type
 * three URLs in, and a provider that does publish one can have its descriptor generated from it
 * without this type changing.
 */
export interface OAuthProviderDescriptor {
  /** Stable, `[a-z0-9-]`, stored on the connection row. Renaming it orphans stored tokens. */
  readonly providerId: string;
  readonly label: string;
  readonly supportedGrants: readonly OAuthGrantKind[];
  /** Required when `authorization_code` is supported. Where the operator's browser is sent. */
  readonly authorizationEndpoint?: string;
  /** Required always — every grant here ends at the token endpoint, including refresh. */
  readonly tokenEndpoint: string;
  /** Required when `device_code` is supported (RFC 8628 §3.1). */
  readonly deviceAuthorizationEndpoint?: string;
  /** Applied when the operator names none. Empty is legitimate — some providers infer scope. */
  readonly defaultScopes: readonly string[];
  /**
   * Whether to send PKCE. Always true for `authorization_code` in practice; modelled as data
   * because a provider that rejects an unrecognized `code_challenge` parameter exists in the wild,
   * and discovering that should be a descriptor edit rather than a code change.
   */
  readonly usesPkce: boolean;
  readonly clientAuth: OAuthClientAuthMethod;
}

/**
 * The client identity used on one request — the operator-supplied credentials joined to the
 * descriptor's {@link OAuthProviderDescriptor.clientAuth}.
 *
 * `authMethod` travels WITH the credentials rather than being read from the descriptor at each call
 * site, so there is exactly one place that decides whether a secret goes in the body, in a header,
 * or nowhere. Three call sites re-deriving it is how one grant ends up authenticating differently
 * from the other two.
 */
export interface OAuthClient {
  readonly clientId: string;
  /** Absent for a public client, which is what a self-hosted install usually is. */
  readonly clientSecret?: string;
  readonly authMethod: OAuthClientAuthMethod;
}

/**
 * One issued token set, normalized away from the wire shape.
 *
 * `expiresAt` is an ABSOLUTE instant rather than the wire's relative `expires_in`, because the
 * value is persisted: a relative lifetime is meaningless once written to a row, and re-deriving it
 * at read time would need the issue instant stored anyway.
 *
 * `refreshToken` is `null`, never `undefined`, so "this provider issues no refresh token" is a
 * value a caller must handle rather than a field it can forget to read. A connection with no
 * refresh token is legitimate; it simply reaches `needs_reauth` at expiry instead of refreshing.
 */
export interface OAuthTokenSet {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly tokenType: string;
  readonly scopes: readonly string[];
  readonly expiresAt: ISODateTime | null;
}

/**
 * The outbound HTTP seam. `typeof fetch` rather than a bespoke interface, matching
 * `connectors/composio-key-probe.ts` and `routes/admin/assistant/list-models.ts`: every call site in
 * this codebase that talks to a third party injects `fetchFn` and defaults to the global.
 */
export type OAuthFetch = typeof fetch;

/** Random-bytes seam, so a test can make `state`, PKCE verifiers, and nonces deterministic without
 *  weakening the production default (`node:crypto`'s `randomBytes`). */
export type OAuthRandomBytes = (byteLength: number) => Uint8Array;

/** The clock seam every dated value in this module goes through. Matches core's `ClockPort` shape
 *  but is restated so `src/platform/oauth/` depends on no repository beyond its own types. */
export interface OAuthClock {
  nowIso(): ISODateTime;
}
