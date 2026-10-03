import { tovuOAuthMessages } from "../endpoint-safety.js";
import assert from "node:assert/strict";
import test from "node:test";

import { registerOAuthClientDynamically } from "@jini-ai/oauth";
import { createTestOAuthPorts, assertOAuthRejects, createFetchDouble, sendJson, startDiscoveryFixture, startLoopbackServer } from "./helpers.js";

/**
 * @file Tests for RFC 7591 dynamic client registration, against real loopback servers.
 *
 * The point of this module is that some authorization servers have NO console where a human could
 * create an app — self-registration is the only way to get a `client_id` at all. So the failure modes
 * that matter are:
 *
 * 1. The request body must be an RFC 7591 client-metadata document a strict server will accept —
 *    `redirect_uris`, `grant_types`, `response_types`, `token_endpoint_auth_method`.
 * 2. A `client_secret` the server volunteers must be carried back to the caller so it can be SEALED,
 *    never dropped and never logged.
 * 3. The registration endpoint is a discovered URL, so it goes through the same outbound-safety gate
 *    as every other discovered endpoint.

 *
 * Design history from the retired Tovu dynamic-registration module. The implementation now lives in
 * Jini/packages/oauth/src/registration.ts; these assertions retain its security argument.
 * @file RFC 7591 dynamic client registration — how Tovu obtains a `client_id` from an authorization
 * server that offers no way for a human to obtain one.
 *
 * ## Why this is not an optional convenience
 *
 * `ports.ts` describes the client id as something the operator supplies, and for a provider with a
 * developer console that is right. A growing share of hosted MCP servers have no console at all:
 * they advertise a `registration_endpoint` and expect clients to self-register, which is the
 * MCP-standard path. For those there is no human route to a client id, so without this module the
 * connection cannot be made at any amount of operator effort.
 *
 * ## What is deliberately NOT done here
 *
 * - **No retry.** Registration is not idempotent. A server that received the request and lost the
 *   response has already minted a client; retrying mints a second one that nothing will ever use and
 *   that nothing will ever clean up. One attempt, terminal either way. This is the same rule
 *   `errors.ts` argues for the code exchange, for the same reason.
 * - **No provider error is treated as retryable.** RFC 7591 §3.2.2 defines its own error codes and
 *   none of them means "call again", so unlike the token endpoint this module does not run the
 *   server's error string through `mapProviderErrorCode` — a server that answered `slow_down` to a
 *   registration must not be able to talk this client into a loop.
 * - **No registration access token is stored.** RFC 7592 management (`registration_access_token`,
 *   `registration_client_uri`) is out of scope; the URI is returned for diagnosis and the token is
 *   not read at all, because storing a credential nothing uses is a liability with no benefit.
 *
 * ## The secret
 *
 * Tovu asks to be a PUBLIC client (`token_endpoint_auth_method: "none"`, PKCE instead of a secret).
 * Some servers issue a `client_secret` regardless. That secret is returned to the caller so it can be
 * SEALED through the existing path — it is never logged, and the caller is responsible for keeping it
 * out of read models.
 * A human is waiting on the connect click this sits inside.
 * RFC 6749 §2.3 methods this client can actually perform. A server echoing anything else has named
 *  a mechanism Tovu cannot execute, so the requested method stands instead.
 * Injected so tests never touch the network. Defaults to global `fetch`.
 * Usually discovered. Validated here regardless of where it came from.
 * Shown to the operator by the authorization server on its consent screen.
 * Must contain every callback URL this client will actually use — a server that pins them will
 *  reject an authorization whose `redirect_uri` was not registered.
 * Defaults to `["authorization_code", "refresh_token"]`. Registering `refresh_token` is what makes
 *  a long-lived connection possible; a server that does not support it ignores the entry.
 * Defaults to `["code"]`.
 * Defaults to `none` — a self-hosted install is a public client and PKCE replaces the secret.
 * The authorization server's RFC 8414 `token_endpoint_auth_methods_supported`, as discovered.
 *  Read only when the server issues a secret without saying how to present it — see
 *  {@link resolveAuthMethod}. Empty or absent means the server did not advertise the member.
 * RFC 7591 §3 open registration needs none; supplied when a server gates registration.
 * One minted client.
 *
 * `clientSecret` is `null`, never `undefined`, so "this server issued no secret" is a value the
 * caller must handle rather than a field it can forget to read — the same rule
 * {@link OAuthTokenSet.refreshToken} follows.
 * SECRET when present. Seal it; never log it; never return it from a read model.
 * What the server said to authenticate with, which is not always what was asked for.
 * RFC 7592 management URI, for diagnosis only — nothing here calls it.
 * RFC 7591 §3.2.1: `0` means the secret never expires.
 * The RFC 7591 §2 client-metadata document Tovu sends. Built in one place so the three defaults
 *  that decide whether the connection can refresh, redirect, and authenticate cannot drift apart.
 *  @complexity O(n) in scopes and redirect URIs.
 * Declared because a server that defaults an unspecified client to `native` will then refuse an
 * https redirect URI, which reads as a redirect-URI bug rather than an application-type one.
 * A whole number from a JSON member, or `null`. `0` is meaningful (RFC 7591 §3.2.1's "never
 *  expires") so it must survive, which rules out a truthiness check. @complexity O(1).
 * The server's echoed auth method when Tovu can perform it, otherwise one that fits what it issued.
 *
 *  The echo WINS when it is supported, and that matters: a server that issued a secret and expects
 *  `client_secret_post` will answer `invalid_client` to every token request from a client that keeps
 *  authenticating as `none`, which surfaces long after registration as an unexplained connect
 *  failure.
 *
 *  With no usable echo, a secret the server issued despite being asked for a public client means the
 *  server wants it presented — measured at Supabase, which answers `none` with 422 "Required
 *  parameter: client_secret". The method then comes from what the server advertises, via
 *  {@link pickSecretAuthMethod}. The requested method stands only when no secret came back, or when
 *  the server advertises no secret-bearing method Tovu can perform. @complexity O(n) in `supported`.
 * `client_secret_basic`, then `client_secret_post`, from the advertised list. An empty list means
 *  the member was omitted, and RFC 8414 §2 defines that as `client_secret_basic`.
 *  @complexity O(n).
 * Turns an RFC 7591 §3.2.2 error body into an {@link OAuthError}.
 *
 * `error_description` is free text from a third party that this codebase renders into a browser and
 * hands to a model, so it never reaches `message` — the same rule `token-endpoint.ts` states. The
 * closed-vocabulary `error` code is preserved in `providerErrorCode` for logs.
 *
 * Always `OAUTH_PROVIDER_REJECTED`, never a mapped code: see this file's header on why no
 * registration failure may be retryable. @complexity O(1).
 * Registers Tovu as a client at an RFC 7591 registration endpoint.
 *
 * @param deps.fetchFn - Outbound HTTP seam; defaults to the global.
 * @param input.registrationEndpoint - Validated through {@link assertSafeProviderEndpoint} before
 *   anything is sent, because in practice this URL was discovered from a remote document.
 * @returns The minted client. `clientSecret` is a SECRET when non-null — seal it.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT`, `OAUTH_PROVIDER_UNREACHABLE`,
 *   `OAUTH_PROVIDER_REJECTED`, or `OAUTH_MALFORMED_RESPONSE`. Every one is terminal; nothing here
 *   retries, and nothing here is marked retryable.
 * @complexity O(1) — one bounded outbound request, response capped at {@link MAX_OAUTH_RESPONSE_BYTES}.
 * A 3xx here would carry Tovu's callback URL — and any initial access token — to a host that
 * was never validated.
 * Checked before the status for the same reason `token-endpoint.ts` does it: an `error` member is
 * the authoritative signal, and servers disagree about which 4xx carries it.
 */

const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/remote-1";

function parseBody(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

test("registration POSTs an RFC 7591 client-metadata document as JSON", async () => {
  const fixture = await startDiscoveryFixture();
  try {
    await registerOAuthClientDynamically(
      {
        ...createTestOAuthPorts({}),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
        registrationEndpoint: `${fixture.origin}/oauth2/register`,
        scopes: ["openid", "email", "offline_access"],
      },
      { messages: tovuOAuthMessages },
    );

    const request = fixture.requests.at(-1);
    assert.ok(request, "expected the registration endpoint to have been called");
    assert.equal(request.method, "POST");
    assert.equal(request.headers["content-type"], "application/json");
    const body = parseBody(request.body);
    assert.deepEqual(body.redirect_uris, [REDIRECT_URI]);
    assert.equal(body.client_name, "Tovu");
    assert.equal(body.software_id, "tovu"); // REGRESSION: fails if registration omits the explicitly bound software_id.
    assert.equal(body.token_endpoint_auth_method, "none");
    assert.deepEqual(body.grant_types, ["authorization_code", "refresh_token"]);
    assert.deepEqual(body.response_types, ["code"]);
    assert.equal(body.scope, "openid email offline_access");
    assert.equal(body.application_type, "web");
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

test("a public client is the default — no client secret is requested and none is required back", async () => {
  const fixture = await startDiscoveryFixture({ registration: { json: { client_id: "minted-abc" } } });
  try {
    const registered = await registerOAuthClientDynamically(
      {
        ...createTestOAuthPorts({}),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
        registrationEndpoint: `${fixture.origin}/oauth2/register`,
        scopes: [],
      },
      { messages: tovuOAuthMessages },
    );
    assert.equal(registered.clientId, "minted-abc");
    assert.equal(registered.clientSecret, null);
    assert.equal(registered.tokenEndpointAuthMethod, "none");
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

test("a server that volunteers a client secret anyway has it carried back, with the auth method it echoed", async () => {
  const fixture = await startDiscoveryFixture({
    registration: {
      json: {
        client_id: "minted-abc",
        client_secret: "server-chose-a-secret",
        token_endpoint_auth_method: "client_secret_post",
        client_id_issued_at: 1_756_000_000,
        client_secret_expires_at: 0,
      },
    },
  });
  try {
    const registered = await registerOAuthClientDynamically(
      {
        ...createTestOAuthPorts({}),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
        registrationEndpoint: `${fixture.origin}/oauth2/register`,
        scopes: [],
      },
      { messages: tovuOAuthMessages },
    );
    assert.equal(registered.clientSecret, "server-chose-a-secret");
    // The server's own choice wins: authenticating with `none` at a server that issued a secret is
    // how a working registration turns into an `invalid_client` at the token endpoint.
    assert.equal(registered.tokenEndpointAuthMethod, "client_secret_post");
    assert.equal(registered.clientIdIssuedAt, 1_756_000_000);
    assert.equal(registered.clientSecretExpiresAt, 0);
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

test("an echoed token_endpoint_auth_method outside the supported vocabulary falls back to the requested one", async () => {
  const fixture = await startDiscoveryFixture({
    registration: { json: { client_id: "minted-abc", token_endpoint_auth_method: "private_key_jwt" } },
  });
  try {
    const registered = await registerOAuthClientDynamically(
      {
        ...createTestOAuthPorts({}),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
        registrationEndpoint: `${fixture.origin}/oauth2/register`,
        scopes: [],
      },
      { messages: tovuOAuthMessages },
    );
    assert.equal(registered.tokenEndpointAuthMethod, "none");
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

test("a response with no client id is a malformed response, not a silently broken connection", async () => {
  const fixture = await startDiscoveryFixture({ registration: { json: { client_secret: "orphan" } } });
  try {
    const error = await assertOAuthRejects(
      () =>
        registerOAuthClientDynamically(
          {
            ...createTestOAuthPorts({}),
            options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
            registrationEndpoint: `${fixture.origin}/oauth2/register`,
            scopes: [],
          },
          { messages: tovuOAuthMessages },
        ),
      "OAUTH_MALFORMED_RESPONSE",
    );
    assert.equal(error.message, "the client registration response contained no client id");
    assert.equal(
      error.operatorAction,
      "This server's dynamic client registration endpoint is not behaving like an RFC 7591 endpoint.",
    );
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

test("a refusal is reported with its RFC 7591 error code and WITHOUT the server's free text", async () => {
  const fixture = await startDiscoveryFixture({
    registration: {
      status: 400,
      json: { error: "invalid_redirect_uri", error_description: "<script>alert(document.cookie)</script>" },
    },
  });
  try {
    const error = await assertOAuthRejects(
      () =>
        registerOAuthClientDynamically(
          {
            ...createTestOAuthPorts({}),
            options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
            registrationEndpoint: `${fixture.origin}/oauth2/register`,
            scopes: [],
          },
          { messages: tovuOAuthMessages },
        ),
      "OAUTH_PROVIDER_REJECTED",
    );
    assert.equal(error.message, "the authorization server refused the client registration (HTTP 400, invalid_redirect_uri)");
    assert.equal(error.providerErrorCode, "invalid_redirect_uri");
    assert.ok(!error.message.includes("script"), "the provider's free text must never reach the message");
    // Registration is never retried, whatever the server calls its error.
    assert.equal(error.retryable, false);
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

test("a refusal a hostile server labels slow_down is still terminal — registration never loops", async () => {
  const fixture = await startDiscoveryFixture({ registration: { status: 429, json: { error: "slow_down" } } });
  try {
    const error = await assertOAuthRejects(
      () =>
        registerOAuthClientDynamically(
          {
            ...createTestOAuthPorts({}),
            options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
            registrationEndpoint: `${fixture.origin}/oauth2/register`,
            scopes: [],
          },
          { messages: tovuOAuthMessages },
        ),
      "OAUTH_PROVIDER_REJECTED",
    );
    assert.equal(error.retryable, false);
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

test("a registration endpoint on an internal address is refused before anything is sent to it", async () => {
  const error = await assertOAuthRejects(
    () =>
      registerOAuthClientDynamically(
        {
          ...createTestOAuthPorts({}),
          options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
          registrationEndpoint: "https://10.0.0.7/oauth2/register",
          scopes: [],
        },
        { messages: tovuOAuthMessages },
      ),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "registration endpoint: provider endpoint resolves to an internal address, which is not allowed");
});

test("an unreachable registration endpoint reports unreachable, names the host, and is not retried", async () => {
  const server = await startLoopbackServer((_req, res) => sendJson(res, 200, {}));
  const origin = server.origin;
  await server.close();

  const error = await assertOAuthRejects(
    () =>
      registerOAuthClientDynamically(
        {
          ...createTestOAuthPorts({}),
          options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
          registrationEndpoint: `${origin}/oauth2/register`,
          scopes: [],
        },
        { messages: tovuOAuthMessages },
      ),
    "OAUTH_PROVIDER_UNREACHABLE",
  );
  assert.equal(error.message, `could not reach the client registration endpoint at ${new URL(origin).host}`);
});

test("a registration endpoint that redirects is refused rather than followed", async () => {
  const server = await startLoopbackServer((_req, res) => {
    res.writeHead(307, { location: "https://elsewhere.example.com/register" });
    res.end();
  });
  try {
    await assertOAuthRejects(
      () =>
        registerOAuthClientDynamically(
          {
            ...createTestOAuthPorts({}),
            options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
            registrationEndpoint: `${server.origin}/oauth2/register`,
            scopes: [],
          },
          { messages: tovuOAuthMessages },
        ),
      "OAUTH_PROVIDER_UNREACHABLE",
    );
    assert.equal(server.requests.length, 1, "registration must make exactly one attempt");
  } finally {
    await server.close();
  }
});

test("an oversized registration response is capped rather than buffered", async () => {
  const server = await startLoopbackServer((_req, res) => {
    res.writeHead(201, { "content-type": "application/json" });
    for (let i = 0; i < 200; i += 1) res.write("x".repeat(1024));
    res.end();
  });
  try {
    const error = await assertOAuthRejects(
      () =>
        registerOAuthClientDynamically(
          {
            ...createTestOAuthPorts({}),
            options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
            registrationEndpoint: `${server.origin}/oauth2/register`,
            scopes: [],
          },
          { messages: tovuOAuthMessages },
        ),
      "OAUTH_MALFORMED_RESPONSE",
    );
    assert.equal(error.message, "the client registration response exceeded 65536 bytes");
    assert.equal(server.requests.length, 1, "registration must make exactly one attempt");
  } finally {
    await server.close();
  }
});

test("requested grant types and auth method are honoured when the caller names them", async () => {
  const fixture = await startDiscoveryFixture();
  try {
    await registerOAuthClientDynamically(
      {
        ...createTestOAuthPorts({}),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
        registrationEndpoint: `${fixture.origin}/oauth2/register`,
        scopes: [],
      },
      {
        messages: tovuOAuthMessages,
        grantTypes: ["urn:ietf:params:oauth:grant-type:device_code"],
        responseTypes: [],
        tokenEndpointAuthMethod: "client_secret_post",
      },
    );
    const body = parseBody(fixture.requests.at(-1)?.body ?? "{}");
    assert.deepEqual(body.grant_types, ["urn:ietf:params:oauth:grant-type:device_code"]);
    assert.equal(body.token_endpoint_auth_method, "client_secret_post");
    assert.deepEqual(body.response_types, []);
    assert.equal(fixture.requests.filter((request) => request.url === "/oauth2/register").length, 1, "registration must make exactly one attempt");
  } finally {
    await fixture.close();
  }
});

for (const [supported, expected] of [
  [undefined, "client_secret_basic"],
  [[], "client_secret_basic"],
  [["client_secret_basic"], "client_secret_basic"],
  [["client_secret_post"], "client_secret_post"],
  [["client_secret_post", "client_secret_basic"], "client_secret_basic"],
  [["none", "private_key_jwt"], "none"],
] as const) {
  test(`secret without an echoed method resolves ${JSON.stringify(supported)} to ${expected}`, async () => {
    const http = createFetchDouble([{ json: { client_id: "issued-id", client_secret: "issued-secret" } }]);
    const registered = await registerOAuthClientDynamically(
      {
        ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
        options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
        registrationEndpoint: "https://auth.example.com/register",
        scopes: [],
      },
      { messages: tovuOAuthMessages, authMethodsSupported: supported },
    );
    assert.equal(registered.clientId, "issued-id");
    assert.equal(registered.clientSecret, "issued-secret");
    assert.equal(registered.tokenEndpointAuthMethod, expected);
    assert.equal(http.requests.length, 1);
  });
}

test("an unreachable registration is attempted exactly once", async () => {
  let attempts = 0;
  await assertOAuthRejects(() => registerOAuthClientDynamically(
    {
      ...createTestOAuthPorts({ fetchFn: async () => {
    attempts += 1;
    throw new Error("connection refused");
  } }),
      options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [REDIRECT_URI] },
      registrationEndpoint: "https://auth.example.com/register",
      scopes: [],
    },
    { messages: tovuOAuthMessages },
  ), "OAUTH_PROVIDER_UNREACHABLE");
  assert.equal(attempts, 1);
});
