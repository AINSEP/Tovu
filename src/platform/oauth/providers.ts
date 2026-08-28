import { assertSafeProviderEndpoint } from "./endpoint-safety.js";
import { OAuthError } from "./errors.js";
import type { OAuthGrantKind, OAuthProviderDescriptor } from "./ports.js";

/**
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
 * The one example descriptor below is exactly that: an example. It is registered so the registry
 * has a real member and the wiring is exercised, and it is written from public RFC-standard field
 * names only. It is NOT a claim that this provider's OAuth support has been verified — see the
 * warning on {@link EXAMPLE_GENERIC_OIDC_PROVIDER}.
 */

const providers = new Map<string, OAuthProviderDescriptor>();

/** Stable id charset, matching `mcp-federation/trust.ts`'s connection-id rule for the same reason:
 *  the id is persisted on a row and appears in operator-facing strings. */
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Validates a descriptor's internal consistency.
 *
 * Endpoint safety is checked HERE, at registration, as well as at use. Checking only at use would
 * let a typo sit in a registration until an operator clicks Connect and gets a failure that reads
 * like a provider outage.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` / `OAUTH_UNSAFE_ENDPOINT`.
 * @complexity O(g) in declared grants.
 */
export function assertValidOAuthProvider(descriptor: OAuthProviderDescriptor): void {
  if (!PROVIDER_ID_PATTERN.test(descriptor.providerId)) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", `'${descriptor.providerId}' is not a valid provider id (lowercase letters, digits and hyphens)`, {
      operatorAction: "Choose a provider id made of lowercase letters, digits and hyphens.",
    });
  }
  if (descriptor.supportedGrants.length === 0) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", `provider '${descriptor.providerId}' declares no supported grants`, {
      operatorAction: "Declare at least one of the browser-redirect or device-code grants.",
    });
  }
  assertSafeProviderEndpoint(descriptor.tokenEndpoint, "token endpoint");
  if (descriptor.supportedGrants.includes("authorization_code")) {
    if (!descriptor.authorizationEndpoint) {
      throw new OAuthError("OAUTH_INVALID_REQUEST", `provider '${descriptor.providerId}' supports the browser redirect grant but declares no authorization endpoint`, {
        operatorAction: "Add this provider's authorization endpoint URL.",
      });
    }
    assertSafeProviderEndpoint(descriptor.authorizationEndpoint, "authorization endpoint");
  }
  if (descriptor.supportedGrants.includes("device_code")) {
    if (!descriptor.deviceAuthorizationEndpoint) {
      throw new OAuthError("OAUTH_INVALID_REQUEST", `provider '${descriptor.providerId}' supports the device grant but declares no device authorization endpoint`, {
        operatorAction: "Add this provider's device authorization endpoint URL.",
      });
    }
    assertSafeProviderEndpoint(descriptor.deviceAuthorizationEndpoint, "device authorization endpoint");
  }
}

/**
 * Registers a built-in provider descriptor. Idempotent by id — a second registration of the same id
 * REPLACES the first, so a deployment can override a shipped descriptor whose endpoints moved
 * without waiting for a release.
 *
 * @throws {OAuthError} When the descriptor is invalid; an invalid registration is refused at the
 * point of registration rather than admitted and failing later.
 * @complexity O(1).
 */
export function registerOAuthProvider(descriptor: OAuthProviderDescriptor): void {
  assertValidOAuthProvider(descriptor);
  providers.set(descriptor.providerId, descriptor);
}

/** Every registered descriptor, in registration order. */
export function listOAuthProviders(): readonly OAuthProviderDescriptor[] {
  return [...providers.values()];
}

/**
 * Looks a descriptor up by id.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when nothing is registered under `providerId` —
 * loudly, because the alternative is a connection row pointing at a provider that silently does
 * nothing.
 * @complexity O(1).
 */
export function getOAuthProvider(providerId: string): OAuthProviderDescriptor {
  const descriptor = providers.get(providerId);
  if (!descriptor) {
    throw new OAuthError("OAUTH_INVALID_REQUEST", `no OAuth provider is registered as '${providerId}'`, {
      operatorAction: "Pick a provider from the list, or define this one's endpoints on the connection.",
    });
  }
  return descriptor;
}

export interface OperatorOAuthProviderInput {
  readonly providerId: string;
  readonly label: string;
  readonly tokenEndpoint: string;
  readonly authorizationEndpoint?: string;
  readonly deviceAuthorizationEndpoint?: string;
  readonly scopes?: readonly string[];
  readonly clientAuth?: OAuthProviderDescriptor["clientAuth"];
}

/**
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
 */
export function buildOperatorOAuthProvider(input: OperatorOAuthProviderInput): OAuthProviderDescriptor {
  const supportedGrants: OAuthGrantKind[] = [];
  if (input.authorizationEndpoint) supportedGrants.push("authorization_code");
  if (input.deviceAuthorizationEndpoint) supportedGrants.push("device_code");

  const descriptor: OAuthProviderDescriptor = {
    providerId: input.providerId,
    label: input.label,
    supportedGrants,
    ...(input.authorizationEndpoint === undefined ? {} : { authorizationEndpoint: input.authorizationEndpoint }),
    tokenEndpoint: input.tokenEndpoint,
    ...(input.deviceAuthorizationEndpoint === undefined ? {} : { deviceAuthorizationEndpoint: input.deviceAuthorizationEndpoint }),
    defaultScopes: input.scopes ?? [],
    usesPkce: true,
    clientAuth: input.clientAuth ?? "none",
  };
  assertValidOAuthProvider(descriptor);
  return descriptor;
}

/**
 * The one shipped example descriptor.
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
export const EXAMPLE_GENERIC_OIDC_PROVIDER: OAuthProviderDescriptor = {
  providerId: "example-oidc",
  label: "Example OIDC-shaped provider",
  supportedGrants: ["authorization_code", "device_code"],
  authorizationEndpoint: "https://oauth.example.com/authorize",
  tokenEndpoint: "https://oauth.example.com/oauth/token",
  deviceAuthorizationEndpoint: "https://oauth.example.com/oauth/device/code",
  defaultScopes: [],
  usesPkce: true,
  clientAuth: "none",
};

registerOAuthProvider(EXAMPLE_GENERIC_OIDC_PROVIDER);
