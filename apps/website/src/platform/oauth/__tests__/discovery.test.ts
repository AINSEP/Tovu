import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverAuthorizationServer,
  fetchAuthorizationServerMetadata,
  parseResourceMetadataUrl,
  parseWwwAuthenticateScopes,
} from "@jini-ai/oauth";
import { createTestDiscoveryOptions, createTestOAuthPorts, assertOAuthRejects, sendJson, startDiscoveryFixture, startLoopbackServer } from "./helpers.js";

/**
 * @file Tests for RFC 9728 (protected-resource metadata) + RFC 8414 (authorization-server metadata)
 * discovery, run against REAL loopback servers.
 *
 * What this file is defending, in order of how much it would hurt to get wrong:
 *
 * 1. **Every URL that arrives in a remote document goes through `assertSafeProviderEndpoint`.**
 *    Discovery inverts the trust story of the rest of `src/platform/oauth/`: an operator typed the other
 *    endpoints, but these ones are chosen by whatever answered the well-known path. A discovered
 *    `token_endpoint` pointing at `http://169.254.169.254/...` is a credential-exfiltration primitive,
 *    not a configuration typo.
 * 2. **One dead authorization server must not take out the whole flow.** Measured in the wild: a
 *    resource advertising two authorization servers where the second answers `{"detail":"Not Found"}`
 *    at its RFC 8414 well-known path. A client that fails on the first miss connects to nothing.
 * 3. Nothing here names a provider. The fixture is a loopback server; the production code path is
 *    the same one any authorization server would take.

 *
 * Design history from the retired Tovu discovery module. The implementation now lives in
 * Jini/packages/oauth/src/discovery.ts; these assertions retain its security argument.
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
 * Shorter than the token-request timeout: discovery may make several requests inside one connect
 *  click, so each has to be quicker than the single call a grant makes.
 * Injected so tests never touch the network. Defaults to global `fetch`.
 * One authorization server's RFC 8414 metadata, narrowed to the members Tovu acts on.
 * Required — an authorization server without one is not usable and is treated as a dead candidate.
 * RFC 7591. `null` means this server has no self-registration path.
 * Scopes the PROTECTED RESOURCE asks for, which are not always the authorization server's full
 *  `scopes_supported`. This is the list a client should request.
 * The protected resource's URL — for an external MCP connection, the MCP endpoint itself.
 * A `WWW-Authenticate` header value already seen from that resource, when the caller has one.
 *  Following it is exact; the well-known fallback is a convention.
 * ---------------------------------------------------------------------------
 * The 401 challenge (RFC 9728 §5.1)
 * ---------------------------------------------------------------------------
 * Reads one `auth-param` out of a `WWW-Authenticate` value, quoted or bare.
 *
 *  A hand-rolled read rather than a full RFC 9110 challenge parser: the header is a single
 *  `Bearer` challenge in every case this handles, and a permissive regex over one named parameter
 *  cannot mis-attribute a value the way a partial multi-challenge parser could.
 *  @complexity O(n) in the header length.
 * Extracts the RFC 9728 `resource_metadata` URL a 401 challenge points at.
 *
 * @returns The URL as sent — still unvalidated, because a challenge is attacker-influenced input and
 * validation belongs at the point of use, where the label for the failure is known.
 * @complexity O(n) in the header length.
 * Extracts the scopes a 401 challenge asks for (RFC 6750 §3).
 *
 * Worth reading rather than defaulting to the authorization server's `scopes_supported`: a resource
 * that names `offline_access` here is telling the client exactly which scope decides whether the
 * connection will ever be refreshable.
 *
 * @complexity O(n) in the header length.
 * ---------------------------------------------------------------------------
 * Fetching one metadata document
 * ---------------------------------------------------------------------------
 * GETs one metadata URL and parses it as a JSON object.
 *
 * @param url - Already through {@link assertSafeProviderEndpoint}.
 * @throws {OAuthError} On any non-2xx, transport failure, redirect, oversized body, or non-object
 *   body. A caller walking candidates decides which of those end the walk — see
 *   {@link isTerminalDiscoveryFailure}.
 * @complexity O(1) — one bounded outbound request.
 * A metadata endpoint that 3xxs would move the whole OAuth configuration to a host that was
 * never validated — the same rule `token-endpoint.ts` applies to the token endpoint.
 * The body is drained rather than abandoned so the socket is released promptly.
 * ---------------------------------------------------------------------------
 * Well-known path construction
 * ---------------------------------------------------------------------------
 * The path component of a URL, without its trailing slash. `""` for a root URL.
 * The RFC 8414 §3.1 candidate URLs for an issuer, in the order a client should try them.
 *
 * The INSERTION form comes first and is the one that matters: RFC 8414 places the well-known segment
 * between the host and the issuer's path (`https://host/.well-known/oauth-authorization-server/tenant`),
 * which is the opposite of the intuitive append and is what a multi-tenant issuer actually serves.
 * The OpenID Connect append form is tried afterwards because plenty of servers only publish that one.
 *
 * @complexity O(1) — at most three candidates.
 * The RFC 9728 §3.1 candidate URLs for a protected resource. Same insertion rule as RFC 8414.
 * ---------------------------------------------------------------------------
 * Authorization-server metadata
 * ---------------------------------------------------------------------------
 * Validates one optional endpoint from a parsed metadata document.
 *  @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` — see this file's header on why this throws rather
 *  than dropping the field.
 * Narrows one parsed RFC 8414 document into {@link DiscoveredAuthorizationServer}.
 *
 * @returns `null` when the document names no token endpoint — an authorization server Tovu cannot
 *   finish any grant against, which is a dead candidate rather than a hard failure.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` when an endpoint it DOES name fails outbound safety.
 * @complexity O(n) in the document's array members.
 * Whether a candidate failure must end the whole walk rather than move to the next candidate.
 *
 * Both codes mean the server answered and the answer was the problem — see this file's header. Every
 * other failure (unreachable, 404, non-2xx) is a candidate that simply is not there.
 *
 * @complexity O(1).
 * The error raised when no candidate produced usable metadata. One place, so the resource-level and
 *  issuer-level exhaustion read identically to an operator.
 * Fetches and narrows one issuer's RFC 8414 metadata, trying each well-known candidate in turn.
 *
 * A failure from a document that DID arrive — an unsafe endpoint inside it, or a body that is not
 * usable JSON — is re-thrown immediately rather than retried against the next candidate: the server
 * has answered the question, and trying its other well-known path would only give it a second chance.
 *
 * @throws {OAuthError} `OAUTH_INVALID_REQUEST` when every candidate was absent, or
 *   `OAUTH_UNSAFE_ENDPOINT` / `OAUTH_MALFORMED_RESPONSE` from one that answered.
 * @complexity O(c) in candidates — at most three bounded requests.
 * ---------------------------------------------------------------------------
 * Protected-resource metadata
 * ---------------------------------------------------------------------------
 * One RFC 9728 document, narrowed. `authorizationServers` are NOT validated here — they are a
 *  candidate list, and the filtering happens where the list is walked.
 * Fetches a protected resource's RFC 9728 metadata.
 *
 * @param input.wwwAuthenticate - When the caller already holds a 401 challenge, its
 *   `resource_metadata` URL is followed EXACTLY and no well-known path is guessed. That URL is
 *   validated first: it is the most attacker-influenced input in this module.
 * @returns `null` when the resource publishes none, which is common and not an error.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT` when a challenge points somewhere Tovu must not go.
 * @complexity O(c) in candidates — at most two bounded requests.
 * ---------------------------------------------------------------------------
 * The whole chain
 * ---------------------------------------------------------------------------
 * Drops candidate issuers Tovu must not talk to. A dropped entry is silent by design — see this
 *  file's header on why a candidate LIST filters and a fetched DOCUMENT throws.
 *  @complexity O(n) in the advertised count.
 * The scopes to request: the 401 challenge's own `scope` param when it named one, else whatever
 *  the protected resource advertised (or none, when neither says anything).
 * The issuers to try, in order: the resource's advertised (and safety-filtered) list, or — when it
 *  advertises none — the resource's own origin, the single-tenant fallback.
 * Tries each issuer in order, returning the first that yields usable RFC 8414 metadata.
 * @throws {OAuthError} a terminal per-issuer failure immediately, or {@link noMetadataError} once
 *   every issuer has been tried and none answered.
 * A server that answered and answered badly is reported, never skipped.
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

// ---------------------------------------------------------------------------
// Parsing the 401 challenge
// ---------------------------------------------------------------------------

/** Shaped exactly like a `WWW-Authenticate` measured from a hosted MCP server. */
const CHALLENGE =
  'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp", scope="openid email offline_access"';

test("parseResourceMetadataUrl reads the RFC 9728 resource_metadata parameter out of a real challenge", () => {
  assert.equal(parseResourceMetadataUrl({ wwwAuthenticate: CHALLENGE }), "https://mcp.example.com/.well-known/oauth-protected-resource/mcp");
});

test("parseResourceMetadataUrl tolerates unquoted values and odd spacing", () => {
  assert.equal(
    parseResourceMetadataUrl({ wwwAuthenticate: "Bearer  scope=openid,  resource_metadata=https://as.example.com/.well-known/x" }),
    "https://as.example.com/.well-known/x",
  );
});

test("parseResourceMetadataUrl returns null when the challenge carries no such parameter", () => {
  assert.equal(parseResourceMetadataUrl({ wwwAuthenticate: 'Bearer realm="mcp", error="invalid_token"' }), null);
});

test("parseWwwAuthenticateScopes splits the space-delimited scope parameter", () => {
  assert.deepEqual(parseWwwAuthenticateScopes({ wwwAuthenticate: CHALLENGE }), ["openid", "email", "offline_access"]);
});

test("parseWwwAuthenticateScopes returns an empty list when the challenge names no scope", () => {
  assert.deepEqual(parseWwwAuthenticateScopes({ wwwAuthenticate: 'Bearer realm="mcp"' }), []);
});

// ---------------------------------------------------------------------------
// The full chain
// ---------------------------------------------------------------------------

test("discovery walks resource -> protected-resource metadata -> authorization-server metadata", async () => {
  const fixture = await startDiscoveryFixture();
  try {
    const discovered = await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) });

    assert.equal(discovered.server.issuer, fixture.origin);
    assert.equal(discovered.server.authorizationEndpoint, `${fixture.origin}/oauth2/authorize`);
    assert.equal(discovered.server.tokenEndpoint, `${fixture.origin}/oauth2/token`);
    assert.equal(discovered.server.registrationEndpoint, `${fixture.origin}/oauth2/register`);
    assert.deepEqual(discovered.server.grantTypesSupported, ["authorization_code", "refresh_token"]);
    assert.deepEqual(discovered.server.codeChallengeMethodsSupported, ["S256"]);
    assert.deepEqual(discovered.server.tokenEndpointAuthMethodsSupported, ["client_secret_basic", "none", "client_secret_post"]);
    assert.deepEqual(discovered.resourceScopes, ["openid", "email", "offline_access"]);
  } finally {
    await fixture.close();
  }
});

test("discovery retains a device endpoint and refuses an unsafe advertised device endpoint", async () => {
  const origin = "http://127.0.0.1:1";
  for (const deviceEndpoint of [`${origin}/device`, "https://169.254.169.254/device"]) {
    const fetchFn: typeof fetch = async (url) => new Response(JSON.stringify(
      String(url).includes("oauth-protected-resource")
        ? { authorization_servers: [origin] }
        : { issuer: origin, token_endpoint: `${origin}/token`, device_authorization_endpoint: deviceEndpoint },
    ));
    if (deviceEndpoint.startsWith(origin)) {
      const discovered = await discoverAuthorizationServer({ ...createTestOAuthPorts({ fetchFn }), resourceUrl: `${origin}/mcp` }, { ...createTestDiscoveryOptions({}) });
      assert.equal(discovered.server.deviceAuthorizationEndpoint, deviceEndpoint);
    } else {
      const error = await assertOAuthRejects(
        () => discoverAuthorizationServer({ ...createTestOAuthPorts({ fetchFn }), resourceUrl: `${origin}/mcp` }, { ...createTestDiscoveryOptions({}) }),
        "OAUTH_UNSAFE_ENDPOINT",
      );
      assert.equal(error.message, "discovered device authorization endpoint: provider endpoint resolves to an internal address, which is not allowed");
    }
  }
});

test("a supplied WWW-Authenticate header is used verbatim rather than guessing the well-known path", async () => {
  // The resource metadata lives somewhere the well-known convention would never find it, so the
  // only way this can pass is by following the header.
  const metadataPath = "/somewhere/else/prm.json";
  let origin = "";
  const server = await startLoopbackServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === metadataPath) {
      sendJson(res, 200, { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ["email"] });
      return;
    }
    if (path === "/.well-known/oauth-authorization-server") {
      sendJson(res, 200, { issuer: origin, token_endpoint: `${origin}/t`, authorization_endpoint: `${origin}/a` });
      return;
    }
    sendJson(res, 404, { detail: "Not Found" });
  });
  origin = server.origin;
  try {
    const discovered = await discoverAuthorizationServer(
      { ...createTestOAuthPorts({}), resourceUrl: `${server.origin}/mcp` },
      { ...createTestDiscoveryOptions({}), wwwAuthenticate: `Bearer resource_metadata="${server.origin}${metadataPath}"` },
    );
    assert.equal(discovered.server.tokenEndpoint, `${server.origin}/t`);
    assert.deepEqual(discovered.resourceScopes, ["email"]);
  } finally {
    await server.close();
  }
});

test("the WWW-Authenticate challenge's own scope parameter wins over the resource's scopes_supported", async () => {
  // Pins the `challengeScopes.length > 0 ? challengeScopes : metadata?.scopesSupported` branch
  // before it moves into its own function — no existing test drove the challenge-wins half.
  const fixture = await startDiscoveryFixture();
  try {
    const discovered = await discoverAuthorizationServer(
      { ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl },
      { ...createTestDiscoveryOptions({}), wwwAuthenticate: 'Bearer scope="offline_access"' },
    );
    // The fixture's protected-resource document advertises ["openid", "email", "offline_access"]
    // (see "discovery walks..." above) — the narrower challenge scope must win over it.
    assert.deepEqual(discovered.resourceScopes, ["offline_access"]);
  } finally {
    await fixture.close();
  }
});

test("a resource that publishes no protected-resource metadata falls back to its own origin as the issuer", async () => {
  const fixture = await startDiscoveryFixture({ withoutProtectedResourceMetadata: true });
  try {
    const discovered = await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) });
    assert.equal(discovered.server.tokenEndpoint, `${fixture.origin}/oauth2/token`);
    // Nothing advertised any scopes, and none are invented.
    assert.deepEqual(discovered.resourceScopes, []);
  } finally {
    await fixture.close();
  }
});

// ---------------------------------------------------------------------------
// Which URL is actually requested
//
// The tests above prove discovery SUCCEEDS, but the fixture answers both well-known
// candidates, so a wrong candidate order would pass them all. The requested path is
// the single structural assumption a real connect depends on, so it is pinned here
// against the shapes measured from a live hosted MCP server.
// ---------------------------------------------------------------------------

test("a resource at /mcp is asked for the PATH-INSERTED protected-resource document first", async () => {
  const fixture = await startDiscoveryFixture({ resourcePath: "/mcp" });
  try {
    await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) });
    const first = fixture.requests[0]?.url.split("?")[0];
    // RFC 9728 §3.1 inserts the segment before the resource's path. A hosted MCP server
    // measured in the wild serves exactly this and 404s the bare form, so an appended or
    // bare-first candidate order would connect to nothing.
    assert.equal(first, "/.well-known/oauth-protected-resource/mcp");
  } finally {
    await fixture.close();
  }
});

test("the bare protected-resource path is a FALLBACK, tried only after the path-inserted one", async () => {
  const seen: string[] = [];
  const server = await startLoopbackServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    seen.push(path);
    if (path === "/.well-known/oauth-protected-resource") {
      sendJson(res, 200, { authorization_servers: [], scopes_supported: ["email"] });
      return;
    }
    if (path === "/.well-known/oauth-authorization-server") {
      sendJson(res, 200, { issuer: origin, token_endpoint: `${origin}/t` });
      return;
    }
    sendJson(res, 404, { detail: "Not Found" });
  });
  origin = server.origin;
  try {
    await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: `${server.origin}/mcp` }, { ...createTestDiscoveryOptions({}) });
    assert.deepEqual(seen.slice(0, 2), ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]);
  } finally {
    await server.close();
  }
});

test("the issuer's RFC 8414 document is asked for before any OpenID Connect fallback", async () => {
  const fixture = await startDiscoveryFixture();
  try {
    await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) });
    const metadataRequests = fixture.requests.filter((request) => request.url.includes("/.well-known/") && !request.url.includes("protected-resource"));
    assert.equal(metadataRequests[0]?.url.split("?")[0], "/.well-known/oauth-authorization-server");
    // It succeeded on the first candidate, so no OpenID Connect path was ever tried.
    assert.equal(metadataRequests.length, 1);
  } finally {
    await fixture.close();
  }
});

for (const { suffix, metadataPath, expectedPaths } of [
  { suffix: "", metadataPath: "/.well-known/openid-configuration",
    expectedPaths: ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"] },
  { suffix: "/tenant-a", metadataPath: "/.well-known/openid-configuration/tenant-a",
    expectedPaths: ["/.well-known/oauth-authorization-server/tenant-a", "/.well-known/openid-configuration/tenant-a"] },
  { suffix: "/tenant-a", metadataPath: "/tenant-a/.well-known/openid-configuration",
    expectedPaths: ["/.well-known/oauth-authorization-server/tenant-a", "/.well-known/openid-configuration/tenant-a", "/tenant-a/.well-known/openid-configuration"] },
]) {
  test(`OIDC-only discovery succeeds at ${metadataPath}`, async () => {
    let origin = "";
    const server = await startLoopbackServer((req, res) => {
      if (req.url === metadataPath) {
        sendJson(res, 200, { issuer: `${origin}${suffix}`, token_endpoint: `${origin}/token`, authorization_endpoint: `${origin}/authorize` });
      } else sendJson(res, 404, {});
    });
    origin = server.origin;
    try {
      const discovered = await fetchAuthorizationServerMetadata({ ...createTestOAuthPorts({}), issuer: `${origin}${suffix}` }, { ...createTestDiscoveryOptions({}) });
      assert.equal(discovered.issuer, `${origin}${suffix}`);
      assert.equal(discovered.tokenEndpoint, `${origin}/token`);
      assert.equal(discovered.authorizationEndpoint, `${origin}/authorize`);
      assert.deepEqual(server.requests.map((request) => request.url), expectedPaths);
    } finally {
      await server.close();
    }
  });
}

test("a real hosted MCP server's 401 challenge parses to its exact metadata URL and scopes", () => {
  // Verbatim from a live probe of a hosted MCP server, kept as a fixture so the parser is
  // pinned against a header a real deployment actually emits rather than a tidied one.
  const measured =
    'Bearer resource_metadata="https://mcp.example.ai/.well-known/oauth-protected-resource/mcp", scope="openid email offline_access"';
  assert.equal(parseResourceMetadataUrl({ wwwAuthenticate: measured }), "https://mcp.example.ai/.well-known/oauth-protected-resource/mcp");
  // `offline_access` is the member that decides whether the connection can ever refresh.
  assert.deepEqual(parseWwwAuthenticateScopes({ wwwAuthenticate: measured }), ["openid", "email", "offline_access"]);
});

// ---------------------------------------------------------------------------
// One dead authorization server must not fail the flow — measured in the wild
// ---------------------------------------------------------------------------

test("an advertised authorization server that 404s its well-known path is skipped, not fatal", async () => {
  const dead = await startLoopbackServer((_req, res) => sendJson(res, 404, { detail: "Not Found" }));
  const fixture = await startDiscoveryFixture({ deadAuthorizationServers: [dead.origin] });
  try {
    const discovered = await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) });
    assert.equal(discovered.server.issuer, fixture.origin);
    // It really did try the dead one first, rather than reordering the list.
    assert.ok(dead.requests.length > 0, "expected the dead authorization server to have been tried");
  } finally {
    await fixture.close();
    await dead.close();
  }
});

test("an advertised authorization server whose metadata has no token endpoint is skipped, not fatal", async () => {
  let halfOrigin = "";
  const half = await startLoopbackServer((req, res) => {
    if ((req.url ?? "").startsWith("/.well-known/oauth-authorization-server")) {
      sendJson(res, 200, { issuer: halfOrigin, authorization_endpoint: `${halfOrigin}/a` });
      return;
    }
    sendJson(res, 404, { detail: "Not Found" });
  });
  halfOrigin = half.origin;
  const fixture = await startDiscoveryFixture({ deadAuthorizationServers: [half.origin] });
  try {
    const discovered = await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) });
    assert.equal(discovered.server.issuer, fixture.origin);
  } finally {
    await fixture.close();
    await half.close();
  }
});

test("when EVERY advertised authorization server fails, the error names the resource and does not retry", async () => {
  const dead = await startLoopbackServer((_req, res) => sendJson(res, 404, { detail: "Not Found" }));
  const fixture = await startDiscoveryFixture({
    deadAuthorizationServers: [dead.origin],
    // The fixture's own well-known AS path is removed, so both candidates fail.
    metadata: { issuer: null, token_endpoint: null, authorization_endpoint: null, registration_endpoint: null },
  });
  try {
    const error = await assertOAuthRejects(
      () => discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) }),
      "OAUTH_INVALID_REQUEST",
    );
    assert.equal(
      error.message,
      `no OAuth authorization server metadata could be discovered for ${new URL(fixture.resourceUrl).host}`,
    );
    assert.equal(
      error.operatorAction,
      "This server publishes no OAuth discovery document — type its OAuth endpoints in the connection settings.",
    );
    assert.deepEqual(dead.requests.map((request) => request.url), [
      "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration",
    ]);
    assert.deepEqual(fixture.requests.map((request) => request.url), [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration",
    ]);
  } finally {
    await fixture.close();
    await dead.close();
  }
});

// ---------------------------------------------------------------------------
// Outbound safety on DISCOVERED URLs — the whole reason this module is dangerous
// ---------------------------------------------------------------------------

test("a discovered token endpoint on an internal address is refused, not used", async () => {
  const fixture = await startDiscoveryFixture({ metadata: { token_endpoint: "https://169.254.169.254/token" } });
  try {
    const error = await assertOAuthRejects(
      () => discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) }),
      "OAUTH_UNSAFE_ENDPOINT",
    );
    assert.equal(
      error.message,
      "discovered token endpoint: provider endpoint resolves to an internal address, which is not allowed",
    );
  } finally {
    await fixture.close();
  }
});

test("a discovered authorization endpoint on plaintext http to a public host is refused", async () => {
  const fixture = await startDiscoveryFixture({ metadata: { authorization_endpoint: "http://auth.example.com/authorize" } });
  try {
    const error = await assertOAuthRejects(
      () => discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) }),
      "OAUTH_UNSAFE_ENDPOINT",
    );
    assert.equal(
      error.message,
      "discovered authorization endpoint: provider endpoint must use https (http is permitted only for loopback)",
    );
  } finally {
    await fixture.close();
  }
});

test("a discovered registration endpoint carrying a javascript: scheme is refused", async () => {
  const fixture = await startDiscoveryFixture({ metadata: { registration_endpoint: "javascript:fetch('/steal')" } });
  try {
    const error = await assertOAuthRejects(
      () => discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) }),
      "OAUTH_UNSAFE_ENDPOINT",
    );
    assert.equal(
      error.message,
      "discovered registration endpoint: provider endpoint must use https (http is permitted only for loopback)",
    );
  } finally {
    await fixture.close();
  }
});

test("an advertised authorization server issuer on an internal address is never fetched", async () => {
  const fixture = await startDiscoveryFixture({ deadAuthorizationServers: ["https://10.1.2.3"] });
  try {
    // The internal issuer is dropped before any request is made, so discovery still succeeds on the
    // legitimate one. If it were fetched, this would hang or fail rather than resolving.
    const discovered = await discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, { ...createTestDiscoveryOptions({}) });
    assert.equal(discovered.server.issuer, fixture.origin);
  } finally {
    await fixture.close();
  }
});

test("a resource_metadata URL pointing at an internal address is refused before it is fetched", async () => {
  const fixture = await startDiscoveryFixture();
  try {
    const error = await assertOAuthRejects(
      () =>
        discoverAuthorizationServer(
          { ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl },
          {
            ...createTestDiscoveryOptions({}),
            wwwAuthenticate: 'Bearer resource_metadata="https://192.168.0.1/.well-known/oauth-protected-resource"',
          },
        ),
      "OAUTH_UNSAFE_ENDPOINT",
    );
    assert.equal(
      error.message,
      "protected resource metadata endpoint: provider endpoint resolves to an internal address, which is not allowed",
    );
  } finally {
    await fixture.close();
  }
});

test("the resource URL itself is safety-checked before anything is derived from it", async () => {
  const error = await assertOAuthRejects(
    () => discoverAuthorizationServer({ ...createTestOAuthPorts({}), resourceUrl: "http://mcp.example.com/mcp" }, { ...createTestDiscoveryOptions({}) }),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "protected resource URL: provider endpoint must use https (http is permitted only for loopback)");
});

// ---------------------------------------------------------------------------
// Bounded, non-redirecting reads
// ---------------------------------------------------------------------------

test("an authorization-server metadata document past the byte cap is a malformed response, not an OOM", async () => {
  const server = await startLoopbackServer((req, res) => {
    if ((req.url ?? "").startsWith("/.well-known/oauth-authorization-server")) {
      res.writeHead(200, { "content-type": "application/json" });
      // Streamed in chunks so the cap has to be enforced mid-stream rather than from Content-Length.
      for (let i = 0; i < 200; i += 1) res.write("x".repeat(1024));
      res.end();
      return;
    }
    sendJson(res, 404, {});
  });
  try {
    const error = await assertOAuthRejects(
      () => fetchAuthorizationServerMetadata({ ...createTestOAuthPorts({}), issuer: server.origin }, { ...createTestDiscoveryOptions({}) }),
      "OAUTH_MALFORMED_RESPONSE",
    );
    assert.equal(error.message, "the OAuth metadata document exceeded 65536 bytes");
  } finally {
    await server.close();
  }
});

test("oversized metadata cancels an unfinished stream as soon as the byte cap is exceeded", async () => {
  let pulls = 0;
  let cancelled = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    pull(value) {
      pulls += 1;
      // Leave the stream open after a bounded supply: buffering until EOF would hang.
      if (pulls <= 66) value.enqueue(new Uint8Array(1024).fill(120));
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const requests: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const error = await assertOAuthRejects(
      () => Promise.race([
        fetchAuthorizationServerMetadata(
          {
            ...createTestOAuthPorts({ fetchFn: async (url) => {
          requests.push(String(url));
          return new Response(body, { headers: { "content-type": "application/json" } });
        } }),
            issuer: "http://127.0.0.1:1",
          },
          { ...createTestDiscoveryOptions({}) },
        ),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("metadata reader waited for EOF beyond the cap")), 2000);
        }),
      ]),
      "OAUTH_MALFORMED_RESPONSE",
    );
    assert.equal(error.message, "the OAuth metadata document exceeded 65536 bytes");
    assert.equal(cancelled, true, "overflow must cancel the still-open response body");
    assert.equal(pulls, 65, "no more chunks may be consumed after the first byte over the cap");
    assert.deepEqual(requests, ["http://127.0.0.1:1/.well-known/oauth-authorization-server"]);
  } finally {
    clearTimeout(timer);
    if (!cancelled) controller!.close();
  }
});

test("a metadata endpoint that redirects is refused rather than followed to an unvalidated host", async () => {
  const server = await startLoopbackServer((_req, res) => {
    res.writeHead(302, { location: "https://elsewhere.example.com/metadata" });
    res.end();
  });
  try {
    await assertOAuthRejects(() => fetchAuthorizationServerMetadata({ ...createTestOAuthPorts({}), issuer: server.origin }, { ...createTestDiscoveryOptions({}) }), "OAUTH_INVALID_REQUEST");
  } finally {
    await server.close();
  }
});

test("a metadata document that is not a JSON object is a malformed response", async () => {
  const server = await startLoopbackServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("[1,2,3]");
  });
  try {
    const error = await assertOAuthRejects(
      () => fetchAuthorizationServerMetadata({ ...createTestOAuthPorts({}), issuer: server.origin }, { ...createTestDiscoveryOptions({}) }),
      "OAUTH_MALFORMED_RESPONSE",
    );
    assert.equal(error.message, "the OAuth metadata endpoint did not return a JSON object");
  } finally {
    await server.close();
  }
});

test("RFC 8414 inserts the well-known segment BEFORE an issuer's path component", async () => {
  const seen: string[] = [];
  const server = await startLoopbackServer((req, res) => {
    seen.push((req.url ?? "").split("?")[0] ?? "");
    sendJson(res, 404, { detail: "Not Found" });
  });
  try {
    await assertOAuthRejects(
      () => fetchAuthorizationServerMetadata({ ...createTestOAuthPorts({}), issuer: `${server.origin}/tenant-a` }, { ...createTestDiscoveryOptions({}) }),
      "OAUTH_INVALID_REQUEST",
    );
    // The RFC 8414 §3.1 form is what a multi-tenant issuer actually serves; appending would 404.
    assert.ok(
      seen.includes("/.well-known/oauth-authorization-server/tenant-a"),
      `expected the RFC 8414 path-insertion form, saw ${JSON.stringify(seen)}`,
    );
  } finally {
    await server.close();
  }
});

// REGRESSION: fails if issuer equality is removed from createTovuIssuerBoundDiscoveryPolicy.
test("discovery refuses a public issuer substitution", async () => {
  const fixture = await startDiscoveryFixture({ metadata: { issuer: "https://different.example.com" } });
  try {
    const error = await assertOAuthRejects(() => discoverAuthorizationServer(
      { ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, createTestDiscoveryOptions({}),
    ), "OAUTH_UNSAFE_ENDPOINT");
    assert.equal(error.message, "OAuth metadata issuer does not equal the requested issuer");
  } finally { await fixture.close(); }
});

// REGRESSION: fails if endpoint-origin equality is removed from createTovuIssuerBoundDiscoveryPolicy.
test("discovery refuses a token endpoint at a different public origin", async () => {
  const fixture = await startDiscoveryFixture({ metadata: { token_endpoint: "https://different.example.com/token" } });
  try {
    const error = await assertOAuthRejects(() => discoverAuthorizationServer(
      { ...createTestOAuthPorts({}), resourceUrl: fixture.resourceUrl }, createTestDiscoveryOptions({}),
    ), "OAUTH_UNSAFE_ENDPOINT");
    assert.equal(error.message, "OAuth metadata token_endpoint does not share the issuer's origin");
  } finally { await fixture.close(); }
});

// REGRESSION: fails if origin metadata fallback is enabled without allowOriginFallback: true.
test("path-scoped issuer discovery requires explicit origin fallback", async () => {
  const issuer = "https://auth.example.com/tenant";
  const requests: string[] = [];
  const fetchFn: typeof fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    requests.push(path);
    return path === "/.well-known/oauth-authorization-server"
      ? new Response(JSON.stringify({ issuer, token_endpoint: "https://auth.example.com/token" }))
      : new Response("{}", { status: 404 });
  };
  await assertOAuthRejects(() => fetchAuthorizationServerMetadata(
    { ...createTestOAuthPorts({ fetchFn }), issuer }, createTestDiscoveryOptions({}),
  ), "OAUTH_INVALID_REQUEST");
  assert.ok(requests.every(path => path.includes("/tenant")));
  const discovered = await fetchAuthorizationServerMetadata(
    { ...createTestOAuthPorts({ fetchFn }), issuer },
    { ...createTestDiscoveryOptions({}), allowOriginFallback: true },
  );
  assert.equal(discovered.issuer, issuer);
  assert.equal(requests.at(-1), "/.well-known/oauth-authorization-server");
});
