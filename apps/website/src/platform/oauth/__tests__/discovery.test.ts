import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverAuthorizationServer,
  fetchAuthorizationServerMetadata,
  parseResourceMetadataUrl,
  parseWwwAuthenticateScopes,
} from "../discovery.js";
import { assertOAuthRejects, sendJson, startDiscoveryFixture, startLoopbackServer } from "./helpers.js";

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
 */

// ---------------------------------------------------------------------------
// Parsing the 401 challenge
// ---------------------------------------------------------------------------

/** Shaped exactly like a `WWW-Authenticate` measured from a hosted MCP server. */
const CHALLENGE =
  'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp", scope="openid email offline_access"';

test("parseResourceMetadataUrl reads the RFC 9728 resource_metadata parameter out of a real challenge", () => {
  assert.equal(parseResourceMetadataUrl(CHALLENGE), "https://mcp.example.com/.well-known/oauth-protected-resource/mcp");
});

test("parseResourceMetadataUrl tolerates unquoted values and odd spacing", () => {
  assert.equal(
    parseResourceMetadataUrl("Bearer  scope=openid,  resource_metadata=https://as.example.com/.well-known/x"),
    "https://as.example.com/.well-known/x",
  );
});

test("parseResourceMetadataUrl returns null when the challenge carries no such parameter", () => {
  assert.equal(parseResourceMetadataUrl('Bearer realm="mcp", error="invalid_token"'), null);
});

test("parseWwwAuthenticateScopes splits the space-delimited scope parameter", () => {
  assert.deepEqual(parseWwwAuthenticateScopes(CHALLENGE), ["openid", "email", "offline_access"]);
});

test("parseWwwAuthenticateScopes returns an empty list when the challenge names no scope", () => {
  assert.deepEqual(parseWwwAuthenticateScopes('Bearer realm="mcp"'), []);
});

// ---------------------------------------------------------------------------
// The full chain
// ---------------------------------------------------------------------------

test("discovery walks resource -> protected-resource metadata -> authorization-server metadata", async () => {
  const fixture = await startDiscoveryFixture();
  try {
    const discovered = await discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl });

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
      {},
      { resourceUrl: `${server.origin}/mcp`, wwwAuthenticate: `Bearer resource_metadata="${server.origin}${metadataPath}"` },
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
      {},
      { resourceUrl: fixture.resourceUrl, wwwAuthenticate: 'Bearer scope="offline_access"' },
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
    const discovered = await discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl });
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
    await discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl });
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
      sendJson(res, 200, { issuer: "x", token_endpoint: `http://127.0.0.1:1/t` });
      return;
    }
    sendJson(res, 404, { detail: "Not Found" });
  });
  try {
    await discoverAuthorizationServer({}, { resourceUrl: `${server.origin}/mcp` });
    assert.deepEqual(seen.slice(0, 2), ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]);
  } finally {
    await server.close();
  }
});

test("the issuer's RFC 8414 document is asked for before any OpenID Connect fallback", async () => {
  const fixture = await startDiscoveryFixture();
  try {
    await discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl });
    const metadataRequests = fixture.requests.filter((request) => request.url.includes("/.well-known/") && !request.url.includes("protected-resource"));
    assert.equal(metadataRequests[0]?.url.split("?")[0], "/.well-known/oauth-authorization-server");
    // It succeeded on the first candidate, so no OpenID Connect path was ever tried.
    assert.equal(metadataRequests.length, 1);
  } finally {
    await fixture.close();
  }
});

test("a real hosted MCP server's 401 challenge parses to its exact metadata URL and scopes", () => {
  // Verbatim from a live probe of a hosted MCP server, kept as a fixture so the parser is
  // pinned against a header a real deployment actually emits rather than a tidied one.
  const measured =
    'Bearer resource_metadata="https://mcp.example.ai/.well-known/oauth-protected-resource/mcp", scope="openid email offline_access"';
  assert.equal(parseResourceMetadataUrl(measured), "https://mcp.example.ai/.well-known/oauth-protected-resource/mcp");
  // `offline_access` is the member that decides whether the connection can ever refresh.
  assert.deepEqual(parseWwwAuthenticateScopes(measured), ["openid", "email", "offline_access"]);
});

// ---------------------------------------------------------------------------
// One dead authorization server must not fail the flow — measured in the wild
// ---------------------------------------------------------------------------

test("an advertised authorization server that 404s its well-known path is skipped, not fatal", async () => {
  const dead = await startLoopbackServer((_req, res) => sendJson(res, 404, { detail: "Not Found" }));
  const fixture = await startDiscoveryFixture({ deadAuthorizationServers: [dead.origin] });
  try {
    const discovered = await discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl });
    assert.equal(discovered.server.issuer, fixture.origin);
    // It really did try the dead one first, rather than reordering the list.
    assert.ok(dead.requests.length > 0, "expected the dead authorization server to have been tried");
  } finally {
    await fixture.close();
    await dead.close();
  }
});

test("an advertised authorization server whose metadata has no token endpoint is skipped, not fatal", async () => {
  const half = await startLoopbackServer((req, res) => {
    if ((req.url ?? "").startsWith("/.well-known/oauth-authorization-server")) {
      sendJson(res, 200, { issuer: "https://half.example.com", authorization_endpoint: "https://half.example.com/a" });
      return;
    }
    sendJson(res, 404, { detail: "Not Found" });
  });
  const fixture = await startDiscoveryFixture({ deadAuthorizationServers: [half.origin] });
  try {
    const discovered = await discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl });
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
      () => discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl }),
      "OAUTH_INVALID_REQUEST",
    );
    assert.equal(
      error.message,
      `no OAuth authorization server metadata could be discovered for ${new URL(fixture.resourceUrl).host}`,
    );
    assert.equal(
      error.operatorAction,
      "This server publishes no OAuth discovery document — type its OAuth endpoints in Settings → External MCP.",
    );
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
      () => discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl }),
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
      () => discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl }),
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
      () => discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl }),
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
    const discovered = await discoverAuthorizationServer({}, { resourceUrl: fixture.resourceUrl });
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
          {},
          {
            resourceUrl: fixture.resourceUrl,
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
    () => discoverAuthorizationServer({}, { resourceUrl: "http://mcp.example.com/mcp" }),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "MCP server URL: provider endpoint must use https (http is permitted only for loopback)");
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
      () => fetchAuthorizationServerMetadata({}, { issuer: server.origin }),
      "OAUTH_MALFORMED_RESPONSE",
    );
    assert.equal(error.message, "the OAuth metadata document exceeded 65536 bytes");
  } finally {
    await server.close();
  }
});

test("a metadata endpoint that redirects is refused rather than followed to an unvalidated host", async () => {
  const server = await startLoopbackServer((_req, res) => {
    res.writeHead(302, { location: "https://elsewhere.example.com/metadata" });
    res.end();
  });
  try {
    await assertOAuthRejects(() => fetchAuthorizationServerMetadata({}, { issuer: server.origin }), "OAUTH_INVALID_REQUEST");
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
      () => fetchAuthorizationServerMetadata({}, { issuer: server.origin }),
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
      () => fetchAuthorizationServerMetadata({}, { issuer: `${server.origin}/tenant-a` }),
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
