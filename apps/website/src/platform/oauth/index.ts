/**
 * @file Durable-store compatibility contracts and Tovu OAuth policy history.
 *
 * Generic flows now come directly from @jini-ai/oauth. The remaining exports preserve the durable
 * store ABI until the separately owned database lane can move its imports and error identity.
 *
 * `ports.ts` carries the argument for why this was written fresh rather than reusing the (since
 * removed) Composio connectors subsystem's state machine, and which of its hardened edges survive.
 *
 * Provider-registry design history; implementation and rationale now live in
 * Jini/packages/oauth/src/registry.ts. Host registries belong to each service instance.
 * @file The provider registry — how a concrete authorization server becomes available to the
 * generic flows without any of them naming it.
 *
 * Modelled on `assistant/mcp-federation/presets.ts`, which solved the identical problem for
 * federated MCP servers: before it existed, `bootstrap.ts` imported one vendor by name and adding a
 * second vendor was an edit to core federation. Same rule here — nothing in `src/platform/oauth/` outside
 * this file knows a provider's name, and adding one is a registration, not a code change in a flow.
 *
 * ## Operator-defined providers are the normal case, not the exception
 *
 * {@link buildOperatorOAuthProvider} exists because the interesting providers are the ones Tovu has
 * never heard of. An operator who can read their provider's OAuth docs can type three URLs and a
 * scope list and connect it, with no code change and no release. The built-in registry is a
 * convenience for providers common enough to be worth pre-filling, not a gate on which providers
 * are supported.
 *
 * The former shipped descriptor was exactly that: an example written from RFC-standard field
 * names. Registries now start empty; the provider test explicitly registers its example. It is NOT a claim that this provider's OAuth support has been verified — see the
 * warning on the provider test's example.
 * Stable id charset, matching `mcp-federation/trust.ts`'s connection-id rule for the same reason:
 *  the id is persisted on a row and appears in operator-facing strings.
 * Validates a descriptor's internal consistency.
 *
 * Endpoint safety is checked HERE, at registration, as well as at use. Checking only at use would
 * let a typo sit in a registration until an operator clicks Connect and gets a failure that reads
 * like a provider outage.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` / `OAUTH_UNSAFE_ENDPOINT`.
 * @complexity O(g) in declared grants.
 * An instance registry registers a provider descriptor. Idempotent by id — a second registration of the same id
 * REPLACES the first, so a deployment can override a shipped descriptor whose endpoints moved
 * without waiting for a release.
 *
 * @throws {OAuthError} When the descriptor is invalid; an invalid registration is refused at the
 * point of registration rather than admitted and failing later.
 * @complexity O(1).
 * An instance lists its registered descriptors in registration order.
 * Looks a descriptor up by id.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when nothing is registered under `providerId` —
 * loudly, because the alternative is a connection row pointing at a provider that silently does
 * nothing.
 * @complexity O(1).
 * Builds a descriptor from operator-typed endpoints.
 *
 * The supported grants are DERIVED from which endpoints were supplied rather than asked for
 * separately. An operator who fills in a device-authorization endpoint has said everything needed
 * to know the device grant is available, and a separate checkbox would only create a state where
 * the two disagree.
 *
 * PKCE is always on. There is no operator switch for it: a self-hosted install is a public client,
 * and a provider that rejects `code_challenge` is a descriptor problem to be fixed in code with the
 * evidence in hand, not a security property to hand an operator a toggle for.
 *
 * @throws {OAuthError} When the resulting descriptor is invalid or an endpoint is unsafe.
 * @complexity O(1).
 * The former shipped example descriptor, now an explicit test fixture.
 *
 * ## Read this before pointing anything real at it
 *
 * These are the CONVENTIONAL endpoint paths an OpenID-Connect-shaped authorization server exposes
 * (`/authorize`, `/oauth/token`, `/oauth/device/code`), against a placeholder host. It exists to
 * prove the registry wiring and to give an operator a filled-in shape to copy. It is **not** a
 * verified integration with any named vendor, and the debate that specified this subsystem closed
 * with exactly that caveat: *"Before building Q3, verify the actual target's OAuth support (does it
 * offer a refresh token at all; does it support device grant) — several participants flagged that
 * the entire design changes if it doesn't."*
 *
 * When a real target is verified, register its descriptor the same way — do not edit this one into
 * it, or the example stops being readable as an example.
 */

export type { OAuthClient, OAuthClientAuthMethod, OAuthClock, OAuthFetch, OAuthGrantKind, OAuthProviderDescriptor, OAuthRandomBytes, OAuthTokenSet } from "./ports.js";
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
