import {
  MAX_OAUTH_RESPONSE_BYTES,
  readBoundedOAuthJson,
  readOptionalString,
  readStringArray,
} from "./bounded-json.js";
import { assertSafeProviderEndpoint } from "./endpoint-safety.js";
import { OAuthError } from "./errors.js";
import type { OAuthFetch } from "./ports.js";

/**
 * @file OAuth metadata discovery — RFC 9728 (protected-resource metadata) and RFC 8414
 * (authorization-server metadata), provider-agnostic like everything else outside `providers.ts`.
 *
 * ## Why this module inverts the trust story of the rest of `src/platform/oauth/`
 *
 * `endpoint-safety.ts` says the bar for an operator-configured endpoint is "don't let a typo turn
 * Tovu into an SSRF proxy", and that a token endpoint is "an operator-configured origin rather than
 * request-body input". Discovery breaks that assumption on purpose: after this module runs, the
 * endpoints Tovu will POST a client secret and an authorization code to were chosen by whatever
 * answered a well-known path on a host an operator merely pointed at. That is strictly more
 * dangerous than a typed URL, not less.
 *
 * So EVERY URL that arrives in a remote document goes through {@link assertSafeProviderEndpoint}
 * before it is stored, fetched, or handed to a flow — and the two kinds of remote URL get two
 * different dispositions, which is the one subtlety here:
 *
 * - A URL in a CANDIDATE LIST (`authorization_servers`) that fails the check is DROPPED. The list is
 *   a menu, and refusing the whole menu because one entry is junk is how a working server becomes
 *   unconnectable.
 * - A URL inside a metadata document that was successfully fetched and parsed THROWS. At that point
 *   Tovu has committed to that authorization server, and a `token_endpoint` pointing at
 *   `169.254.169.254` is an exfiltration attempt to report, not a field to skip.
 *
 * The same split governs which FETCH failures move on to the next candidate. A 404 or an unreachable
 * host means "not here, try the next path" — that is exactly the measured trap below. A 200 carrying
 * a body that is oversized or is not a JSON object means "here, and broken", which is a specific
 * thing to tell an operator rather than something to bury under a generic "publishes nothing".
 *
 * ## One dead authorization server must not fail the whole flow
 *
 * Measured against a real hosted MCP server: it advertised two authorization servers, and the second
 * answered `{"detail":"Not Found"}` at its RFC 8414 well-known path. A client that treats the first
 * miss as fatal connects to nothing. Every candidate is therefore tried in order and only the
 * exhaustion of all of them is an error.
 *
 * ## Nothing here names a provider
 *
 * The whole point of discovery is that Tovu has never heard of the server. Adding support for one is
 * a registration in `providers.ts` or a row an operator saved — never a branch in this file.
 */

/** Shorter than the token-request timeout: discovery may make several requests inside one connect
 *  click, so each has to be quicker than the single call a grant makes. */
const DISCOVERY_TIMEOUT_MS = 10_000;

const METADATA_MESSAGES = {
  overflowMessage: `the OAuth metadata document exceeded ${MAX_OAUTH_RESPONSE_BYTES} bytes`,
  overflowOperatorAction: "This server's OAuth metadata endpoint is not behaving like an RFC 8414 endpoint.",
  notJsonMessage: "the OAuth metadata endpoint did not return a JSON object",
  notJsonOperatorAction: "Check that this server publishes OAuth metadata, or type its endpoints by hand.",
} as const;

export interface OAuthDiscoveryDeps {
  /** Injected so tests never touch the network. Defaults to global `fetch`. */
  readonly fetchFn?: OAuthFetch;
}

/** One authorization server's RFC 8414 metadata, narrowed to the members Tovu acts on. */
export interface DiscoveredAuthorizationServer {
  readonly issuer: string;
  readonly authorizationEndpoint: string | null;
  /** Required — an authorization server without one is not usable and is treated as a dead candidate. */
  readonly tokenEndpoint: string;
  readonly deviceAuthorizationEndpoint: string | null;
  /** RFC 7591. `null` means this server has no self-registration path. */
  readonly registrationEndpoint: string | null;
  readonly scopesSupported: readonly string[];
  readonly grantTypesSupported: readonly string[];
  readonly codeChallengeMethodsSupported: readonly string[];
  readonly tokenEndpointAuthMethodsSupported: readonly string[];
}

export interface DiscoveredOAuthConfiguration {
  readonly server: DiscoveredAuthorizationServer;
  /** Scopes the PROTECTED RESOURCE asks for, which are not always the authorization server's full
   *  `scopes_supported`. This is the list a client should request. */
  readonly resourceScopes: readonly string[];
}

export interface DiscoverAuthorizationServerInput {
  /** The protected resource's URL — for an external MCP connection, the MCP endpoint itself. */
  readonly resourceUrl: string;
  /** A `WWW-Authenticate` header value already seen from that resource, when the caller has one.
   *  Following it is exact; the well-known fallback is a convention. */
  readonly wwwAuthenticate?: string;
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// The 401 challenge (RFC 9728 §5.1)
// ---------------------------------------------------------------------------

/** Reads one `auth-param` out of a `WWW-Authenticate` value, quoted or bare.
 *
 *  A hand-rolled read rather than a full RFC 9110 challenge parser: the header is a single
 *  `Bearer` challenge in every case this handles, and a permissive regex over one named parameter
 *  cannot mis-attribute a value the way a partial multi-challenge parser could.
 *  @complexity O(n) in the header length. */
function readAuthParam(wwwAuthenticate: string, name: string): string | null {
  const match = new RegExp(`(?:^|[\\s,])${name}\\s*=\\s*(?:"([^"]*)"|([^\\s,"]+))`, "i").exec(wwwAuthenticate);
  const value = match?.[1] ?? match?.[2];
  return value !== undefined && value.trim() !== "" ? value.trim() : null;
}

/**
 * Extracts the RFC 9728 `resource_metadata` URL a 401 challenge points at.
 *
 * @returns The URL as sent — still unvalidated, because a challenge is attacker-influenced input and
 * validation belongs at the point of use, where the label for the failure is known.
 * @complexity O(n) in the header length.
 */
export function parseResourceMetadataUrl(wwwAuthenticate: string): string | null {
  return readAuthParam(wwwAuthenticate, "resource_metadata");
}

/**
 * Extracts the scopes a 401 challenge asks for (RFC 6750 §3).
 *
 * Worth reading rather than defaulting to the authorization server's `scopes_supported`: a resource
 * that names `offline_access` here is telling the client exactly which scope decides whether the
 * connection will ever be refreshable.
 *
 * @complexity O(n) in the header length.
 */
export function parseWwwAuthenticateScopes(wwwAuthenticate: string): readonly string[] {
  const scope = readAuthParam(wwwAuthenticate, "scope");
  return scope === null ? [] : scope.split(/[\s,]+/).filter((part) => part.length > 0);
}

// ---------------------------------------------------------------------------
// Fetching one metadata document
// ---------------------------------------------------------------------------

/**
 * GETs one metadata URL and parses it as a JSON object.
 *
 * @param url - Already through {@link assertSafeProviderEndpoint}.
 * @throws {OAuthError} On any non-2xx, transport failure, redirect, oversized body, or non-object
 *   body. A caller walking candidates decides which of those end the walk — see
 *   {@link isTerminalDiscoveryFailure}.
 * @complexity O(1) — one bounded outbound request.
 */
async function fetchMetadataDocument(
  deps: OAuthDiscoveryDeps,
  url: URL,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const fetchFn = deps.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      // A metadata endpoint that 3xxs would move the whole OAuth configuration to a host that was
      // never validated — the same rule `token-endpoint.ts` applies to the token endpoint.
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new OAuthError("OAUTH_PROVIDER_UNREACHABLE", `could not reach the OAuth metadata endpoint at ${url.host}`, {
      operatorAction: "Check network access to this server, then try connecting again.",
      cause,
    });
  }

  if (!response.ok) {
    // The body is drained rather than abandoned so the socket is released promptly.
    await response.body?.cancel().catch(() => undefined);
    throw new OAuthError("OAUTH_PROVIDER_REJECTED", `the OAuth metadata endpoint answered HTTP ${response.status}`, {
      operatorAction: "This server publishes no OAuth metadata at that location.",
    });
  }
  return readBoundedOAuthJson(response, METADATA_MESSAGES);
}

// ---------------------------------------------------------------------------
// Well-known path construction
// ---------------------------------------------------------------------------

/** The path component of a URL, without its trailing slash. `""` for a root URL. */
function issuerPathSuffix(url: URL): string {
  return url.pathname.replace(/\/+$/, "");
}

/**
 * The RFC 8414 §3.1 candidate URLs for an issuer, in the order a client should try them.
 *
 * The INSERTION form comes first and is the one that matters: RFC 8414 places the well-known segment
 * between the host and the issuer's path (`https://host/.well-known/oauth-authorization-server/tenant`),
 * which is the opposite of the intuitive append and is what a multi-tenant issuer actually serves.
 * The OpenID Connect append form is tried afterwards because plenty of servers only publish that one.
 *
 * @complexity O(1) — at most three candidates.
 */
function authorizationServerMetadataCandidates(issuer: URL): readonly URL[] {
  const suffix = issuerPathSuffix(issuer);
  const candidates = [
    new URL(`/.well-known/oauth-authorization-server${suffix}`, issuer),
    new URL(`/.well-known/openid-configuration${suffix}`, issuer),
  ];
  if (suffix !== "") candidates.push(new URL(`${suffix}/.well-known/openid-configuration`, issuer));
  return candidates;
}

/** The RFC 9728 §3.1 candidate URLs for a protected resource. Same insertion rule as RFC 8414. */
function protectedResourceMetadataCandidates(resource: URL): readonly URL[] {
  const suffix = issuerPathSuffix(resource);
  const candidates = [new URL(`/.well-known/oauth-protected-resource${suffix}`, resource)];
  if (suffix !== "") candidates.push(new URL("/.well-known/oauth-protected-resource", resource));
  return candidates;
}

// ---------------------------------------------------------------------------
// Authorization-server metadata
// ---------------------------------------------------------------------------

/** Validates one optional endpoint from a parsed metadata document.
 *  @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` — see this file's header on why this throws rather
 *  than dropping the field. */
function readDiscoveredEndpoint(document: Record<string, unknown>, key: string, label: string): string | null {
  const raw = readOptionalString(document[key]);
  if (raw === null) return null;
  assertSafeProviderEndpoint(raw, label);
  return raw;
}

/**
 * Narrows one parsed RFC 8414 document into {@link DiscoveredAuthorizationServer}.
 *
 * @returns `null` when the document names no token endpoint — an authorization server Tovu cannot
 *   finish any grant against, which is a dead candidate rather than a hard failure.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` when an endpoint it DOES name fails outbound safety.
 * @complexity O(n) in the document's array members.
 */
function narrowAuthorizationServerMetadata(
  document: Record<string, unknown>,
  fallbackIssuer: string,
): DiscoveredAuthorizationServer | null {
  const tokenEndpoint = readDiscoveredEndpoint(document, "token_endpoint", "discovered token endpoint");
  if (tokenEndpoint === null) return null;

  return {
    issuer: readOptionalString(document.issuer) ?? fallbackIssuer,
    authorizationEndpoint: readDiscoveredEndpoint(document, "authorization_endpoint", "discovered authorization endpoint"),
    tokenEndpoint,
    deviceAuthorizationEndpoint: readDiscoveredEndpoint(
      document,
      "device_authorization_endpoint",
      "discovered device authorization endpoint",
    ),
    registrationEndpoint: readDiscoveredEndpoint(document, "registration_endpoint", "discovered registration endpoint"),
    scopesSupported: readStringArray(document.scopes_supported),
    grantTypesSupported: readStringArray(document.grant_types_supported),
    codeChallengeMethodsSupported: readStringArray(document.code_challenge_methods_supported),
    tokenEndpointAuthMethodsSupported: readStringArray(document.token_endpoint_auth_methods_supported),
  };
}

/**
 * Whether a candidate failure must end the whole walk rather than move to the next candidate.
 *
 * Both codes mean the server answered and the answer was the problem — see this file's header. Every
 * other failure (unreachable, 404, non-2xx) is a candidate that simply is not there.
 *
 * @complexity O(1).
 */
function isTerminalDiscoveryFailure(error: unknown): error is OAuthError {
  return error instanceof OAuthError && (error.code === "OAUTH_UNSAFE_ENDPOINT" || error.code === "OAUTH_MALFORMED_RESPONSE");
}

/** The error raised when no candidate produced usable metadata. One place, so the resource-level and
 *  issuer-level exhaustion read identically to an operator. */
function noMetadataError(host: string): OAuthError {
  return new OAuthError("OAUTH_INVALID_REQUEST", `no OAuth authorization server metadata could be discovered for ${host}`, {
    operatorAction: "This server publishes no OAuth discovery document — type its OAuth endpoints in Settings → External MCP.",
  });
}

/**
 * Fetches and narrows one issuer's RFC 8414 metadata, trying each well-known candidate in turn.
 *
 * A failure from a document that DID arrive — an unsafe endpoint inside it, or a body that is not
 * usable JSON — is re-thrown immediately rather than retried against the next candidate: the server
 * has answered the question, and trying its other well-known path would only give it a second chance.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when every candidate was absent, or
 *   `OAUTH_UNSAFE_ENDPOINT` / `OAUTH_MALFORMED_RESPONSE` from one that answered.
 * @complexity O(c) in candidates — at most three bounded requests.
 */
export async function fetchAuthorizationServerMetadata(
  deps: OAuthDiscoveryDeps,
  input: { readonly issuer: string; readonly timeoutMs?: number },
): Promise<DiscoveredAuthorizationServer> {
  const issuer = assertSafeProviderEndpoint(input.issuer, "authorization server issuer");
  const timeoutMs = input.timeoutMs ?? DISCOVERY_TIMEOUT_MS;

  for (const candidate of authorizationServerMetadataCandidates(issuer)) {
    let document: Record<string, unknown>;
    try {
      document = await fetchMetadataDocument(deps, candidate, timeoutMs);
    } catch (error) {
      if (isTerminalDiscoveryFailure(error)) throw error;
      continue;
    }
    const narrowed = narrowAuthorizationServerMetadata(document, issuer.origin);
    if (narrowed !== null) return narrowed;
  }
  throw noMetadataError(issuer.host);
}

// ---------------------------------------------------------------------------
// Protected-resource metadata
// ---------------------------------------------------------------------------

/** One RFC 9728 document, narrowed. `authorizationServers` are NOT validated here — they are a
 *  candidate list, and the filtering happens where the list is walked. */
export interface DiscoveredProtectedResource {
  readonly resource: string | null;
  readonly authorizationServers: readonly string[];
  readonly scopesSupported: readonly string[];
}

/**
 * Fetches a protected resource's RFC 9728 metadata.
 *
 * @param input.wwwAuthenticate - When the caller already holds a 401 challenge, its
 *   `resource_metadata` URL is followed EXACTLY and no well-known path is guessed. That URL is
 *   validated first: it is the most attacker-influenced input in this module.
 * @returns `null` when the resource publishes none, which is common and not an error.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` when a challenge points somewhere Tovu must not go.
 * @complexity O(c) in candidates — at most two bounded requests.
 */
export async function discoverProtectedResourceMetadata(
  deps: OAuthDiscoveryDeps,
  input: { readonly resourceUrl: string; readonly wwwAuthenticate?: string; readonly timeoutMs?: number },
): Promise<DiscoveredProtectedResource | null> {
  const resource = assertSafeProviderEndpoint(input.resourceUrl, "MCP server URL");
  const timeoutMs = input.timeoutMs ?? DISCOVERY_TIMEOUT_MS;

  const advertised = input.wwwAuthenticate === undefined ? null : parseResourceMetadataUrl(input.wwwAuthenticate);
  const candidates =
    advertised === null
      ? protectedResourceMetadataCandidates(resource)
      : [assertSafeProviderEndpoint(advertised, "protected resource metadata endpoint")];

  for (const candidate of candidates) {
    let document: Record<string, unknown>;
    try {
      document = await fetchMetadataDocument(deps, candidate, timeoutMs);
    } catch (error) {
      if (isTerminalDiscoveryFailure(error)) throw error;
      continue;
    }
    return {
      resource: readOptionalString(document.resource),
      authorizationServers: readStringArray(document.authorization_servers),
      scopesSupported: readStringArray(document.scopes_supported),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The whole chain
// ---------------------------------------------------------------------------

/** Drops candidate issuers Tovu must not talk to. A dropped entry is silent by design — see this
 *  file's header on why a candidate LIST filters and a fetched DOCUMENT throws.
 *  @complexity O(n) in the advertised count. */
function safeIssuerCandidates(advertised: readonly string[]): readonly string[] {
  return advertised.filter((issuer) => {
    try {
      assertSafeProviderEndpoint(issuer, "authorization server issuer");
      return true;
    } catch {
      return false;
    }
  });
}

/** The scopes to request: the 401 challenge's own `scope` param when it named one, else whatever
 *  the protected resource advertised (or none, when neither says anything). */
function resolveResourceScopes(
  wwwAuthenticate: string | undefined,
  metadata: DiscoveredProtectedResource | null,
): readonly string[] {
  const challengeScopes = wwwAuthenticate === undefined ? [] : parseWwwAuthenticateScopes(wwwAuthenticate);
  return challengeScopes.length > 0 ? challengeScopes : (metadata?.scopesSupported ?? []);
}

/** The issuers to try, in order: the resource's advertised (and safety-filtered) list, or — when it
 *  advertises none — the resource's own origin, the single-tenant fallback. */
function resolveIssuerCandidates(metadata: DiscoveredProtectedResource | null, resourceOrigin: string): readonly string[] {
  const advertised = safeIssuerCandidates(metadata?.authorizationServers ?? []);
  return advertised.length > 0 ? advertised : [resourceOrigin];
}

/**
 * Tries each issuer in order, returning the first that yields usable RFC 8414 metadata.
 * @throws {OAuthError} a terminal per-issuer failure immediately, or {@link noMetadataError} once
 *   every issuer has been tried and none answered.
 */
async function fetchFirstAuthorizationServer(
  deps: OAuthDiscoveryDeps,
  issuers: readonly string[],
  timeoutMs: number,
  resourceHost: string,
): Promise<DiscoveredAuthorizationServer> {
  for (const issuer of issuers) {
    try {
      return await fetchAuthorizationServerMetadata(deps, { issuer, timeoutMs });
    } catch (error) {
      // A server that answered and answered badly is reported, never skipped.
      if (isTerminalDiscoveryFailure(error)) throw error;
    }
  }
  throw noMetadataError(resourceHost);
}

/**
 * Resolves an MCP server URL to the authorization server that protects it, and the scopes to ask for.
 *
 * The chain is: the 401 challenge (or the RFC 9728 well-known path) gives a protected-resource
 * document; that document names one or more authorization servers; each is tried in turn against RFC
 * 8414 until one yields usable metadata. A resource that publishes nothing falls back to treating its
 * own origin as the issuer, which is what most single-tenant deployments actually are.
 *
 * @returns The chosen authorization server plus the resource's own requested scopes.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` when a resource URL or a discovered endpoint fails the
 *   outbound-safety gate; `OAUTH_MALFORMED_RESPONSE` when a server answered with an unusable body;
 *   `OAUTH_INVALID_REQUEST` when no candidate published metadata at all.
 * @complexity O(a · c) — authorization-server candidates times well-known candidates, each one
 *   bounded request. Both factors are small and neither is caller-controlled beyond the advertised
 *   list, which is capped by what one document can hold under {@link MAX_OAUTH_RESPONSE_BYTES}.
 * @tradeoffs Sequential rather than parallel: the candidates are an ORDERED preference list, and
 *   racing them would mean connecting to whichever server happened to answer first.
 */
export async function discoverAuthorizationServer(
  deps: OAuthDiscoveryDeps,
  input: DiscoverAuthorizationServerInput,
): Promise<DiscoveredOAuthConfiguration> {
  const resource = assertSafeProviderEndpoint(input.resourceUrl, "MCP server URL");
  const timeoutMs = input.timeoutMs ?? DISCOVERY_TIMEOUT_MS;

  const metadata = await discoverProtectedResourceMetadata(deps, {
    resourceUrl: input.resourceUrl,
    ...(input.wwwAuthenticate === undefined ? {} : { wwwAuthenticate: input.wwwAuthenticate }),
    timeoutMs,
  });

  const resourceScopes = resolveResourceScopes(input.wwwAuthenticate, metadata);
  const issuers = resolveIssuerCandidates(metadata, resource.origin);

  const server = await fetchFirstAuthorizationServer(deps, issuers, timeoutMs, resource.host);
  return { server, resourceScopes };
}
