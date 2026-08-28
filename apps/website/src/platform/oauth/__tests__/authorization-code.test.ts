import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { beginAuthorizationCode, completeAuthorizationCode } from "../authorization-code.js";
import { createPendingAuthorizationStore } from "../pending-authorizations.js";
import type { OAuthProviderDescriptor } from "../ports.js";
import {
  assertOAuthRejects,
  assertOAuthThrows,
  createFetchDouble,
  createTestClock,
  TEST_CLIENT,
  TEST_PROVIDER,
} from "./helpers.js";

/**
 * @file The authorization-code + PKCE grant.
 *
 * Four properties are load-bearing and each has a test that fails if it regresses:
 * PKCE actually reaches the token endpoint; `state` is validated before anything else happens; a
 * provider that is slow or unreachable fails fast and is NOT retried; and a callback carrying an
 * `error` is treated as terminal rather than as a blip.
 */

const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/higgs";

function makeFlow(providerOverrides: Partial<OAuthProviderDescriptor> = {}) {
  const clock = createTestClock();
  const pending = createPendingAuthorizationStore({ clock });
  const provider = { ...TEST_PROVIDER, ...providerOverrides };
  return { clock, pending, provider };
}

test("begin builds an authorization URL carrying response_type, client_id, redirect_uri, scope, state and the S256 challenge", () => {
  const { pending, provider } = makeFlow();

  const started = beginAuthorizationCode(
    { provider, pending },
    { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI },
  );

  const url = new URL(started.authorizationUrl);
  assert.equal(url.origin + url.pathname, "https://auth.example.com/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "tovu-client");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), "images:generate");
  assert.equal(url.searchParams.get("state"), started.state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  // The URL is handed to a browser: it must not carry the verifier.
  assert.equal(url.searchParams.get("code_verifier"), null);
});

test("begin performs no I/O — a dead provider cannot make starting a connection hang", () => {
  const { pending, provider } = makeFlow();
  const http = createFetchDouble([{ throws: new Error("network down") }]);

  beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });

  assert.equal(http.callCount(), 0);
});

test("complete sends the matching code_verifier, the stored redirect_uri, and no client secret for a public client", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const challengeSent = new URL(started.authorizationUrl).searchParams.get("code_challenge");
  const http = createFetchDouble([{ json: { access_token: "at-1", refresh_token: "rt-1", token_type: "Bearer", expires_in: 3600, scope: "images:generate" } }]);

  const tokens = await completeAuthorizationCode(
    { provider, pending, clock, fetchFn: http.fetchFn },
    { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "auth-code-1" } },
  );

  const request = http.requests[0];
  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://auth.example.com/token");
  assert.equal(request.redirect, "error");
  assert.equal(request.body.get("grant_type"), "authorization_code");
  assert.equal(request.body.get("code"), "auth-code-1");
  assert.equal(request.body.get("redirect_uri"), REDIRECT_URI);
  assert.equal(request.body.get("client_secret"), null);
  // The verifier that was sent must be the pre-image of the challenge the browser carried.
  const verifierSent = request.body.get("code_verifier") ?? "";
  assert.equal(createHash("sha256").update(verifierSent, "ascii").digest("base64url"), challengeSent);

  assert.deepEqual(tokens, {
    accessToken: "at-1",
    refreshToken: "rt-1",
    tokenType: "Bearer",
    scopes: ["images:generate"],
    expiresAt: "2026-08-25T13:00:00.000Z",
  });
});

test("expires_in becomes an absolute expiresAt computed from the injected clock", async () => {
  const { clock, pending, provider } = makeFlow();
  clock.setIso("2030-01-01T00:00:00.000Z");
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ json: { access_token: "at", expires_in: 60 } }]);

  const tokens = await completeAuthorizationCode(
    { provider, pending, clock, fetchFn: http.fetchFn },
    { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "c" } },
  );

  assert.equal(tokens.expiresAt, "2030-01-01T00:01:00.000Z");
});

test("a provider that omits expires_in yields a null expiry rather than a fabricated one", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const tokens = await completeAuthorizationCode(
    { provider, pending, clock, fetchFn: http.fetchFn },
    { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "c" } },
  );

  assert.equal(tokens.expiresAt, null);
  assert.equal(tokens.refreshToken, null);
});

test("a replayed callback is refused and never reaches the token endpoint a second time", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ json: { access_token: "at" } }]);
  const deps = { provider, pending, clock, fetchFn: http.fetchFn };
  const params = { state: started.state, code: "c" };

  await completeAuthorizationCode(deps, { ownerKey: "ws:higgs", client: TEST_CLIENT, params });
  await assertOAuthRejects(
    () => completeAuthorizationCode(deps, { ownerKey: "ws:higgs", client: TEST_CLIENT, params }),
    "OAUTH_INVALID_STATE",
  );

  assert.equal(http.callCount(), 1);
});

test("a state belonging to another connection is refused before any exchange", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:some-other-server", client: TEST_CLIENT, params: { state: started.state, code: "c" } },
      ),
    "OAUTH_INVALID_STATE",
  );
  assert.equal(http.callCount(), 0);
});

test("a missing state is refused without contacting the provider", async () => {
  const { clock, pending, provider } = makeFlow();
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: "", code: "c" } },
      ),
    "OAUTH_INVALID_STATE",
  );
  assert.equal(http.callCount(), 0);
});

test("an oversized authorization code is refused before it is put in a form body", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "x".repeat(2049) } },
      ),
    "OAUTH_INVALID_REQUEST",
  );
  assert.equal(error.message, "the authorization code exceeded 2048 characters");
  assert.equal(http.callCount(), 0);
});

test("a callback carrying error=access_denied is terminal, not retryable", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, error: "access_denied" } },
      ),
    "OAUTH_ACCESS_DENIED",
  );
  assert.equal(error.retryable, false);
  assert.equal(error.message, "authorization was declined");
  assert.equal(http.callCount(), 0);
});

test("an unreachable token endpoint fails fast and is NOT retried", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ throws: Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }) }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "c" } },
      ),
    "OAUTH_PROVIDER_UNREACHABLE",
  );

  assert.equal(error.retryable, false);
  assert.equal(error.message, "could not reach the authorization server at auth.example.com");
  assert.equal(
    error.operatorAction,
    "Check network access to this provider, then try connecting again. Nothing was retried automatically.",
  );
  // The whole point: exactly one attempt.
  assert.equal(http.callCount(), 1);
});

test("a provider error body never leaks its description into the message", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([
    { status: 400, json: { error: "invalid_client", error_description: "client 8f3a for tenant acme-internal is not authorized" } },
  ]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "c" } },
      ),
    "OAUTH_PROVIDER_REJECTED",
  );

  assert.equal(error.message, "the authorization server refused the request (HTTP 400, invalid_client)");
  assert.equal(error.providerErrorCode, "invalid_client");
  assert.ok(!error.message.includes("acme-internal"));
});

test("a token endpoint that answers with something other than JSON is a malformed response, not a token", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ text: "<html>login</html>" }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "c" } },
      ),
    "OAUTH_MALFORMED_RESPONSE",
  );
  assert.equal(error.message, "the authorization server did not return a JSON object");
});

test("an oversized token response is refused rather than buffered", async () => {
  const { clock, pending, provider } = makeFlow();
  const started = beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI });
  const http = createFetchDouble([{ text: `{"access_token":"${"a".repeat(70_000)}"}` }]);

  const error = await assertOAuthRejects(
    () =>
      completeAuthorizationCode(
        { provider, pending, clock, fetchFn: http.fetchFn },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, params: { state: started.state, code: "c" } },
      ),
    "OAUTH_MALFORMED_RESPONSE",
  );
  assert.equal(error.message, "the authorization server's response exceeded 65536 bytes");
});

test("an http:// redirect URI is refused at begin, so a plaintext code leg can never be started", () => {
  const { pending, provider } = makeFlow();

  const error = assertOAuthThrows(
    () => beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: "http://tovu.example.com/cb" }),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "redirect URI: provider endpoint must use https (http is permitted only for loopback)");
});

test("a redirect URI pointing at internal address space is refused", () => {
  const { pending, provider } = makeFlow();

  assertOAuthThrows(
    () => beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: "https://169.254.169.254/cb" }),
    "OAUTH_UNSAFE_ENDPOINT",
  );
});

test("a provider that does not declare the authorization-code grant refuses to start one", () => {
  const { pending, provider } = makeFlow({ supportedGrants: ["device_code"] });

  const error = assertOAuthThrows(
    () => beginAuthorizationCode({ provider, pending }, { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI }),
    "OAUTH_UNSUPPORTED_GRANT",
  );
  assert.equal(error.message, "provider 'test-provider' does not support the authorization_code grant");
});

test("an extra authorization parameter cannot overwrite one Tovu owns", () => {
  const { pending, provider } = makeFlow();

  const error = assertOAuthThrows(
    () =>
      beginAuthorizationCode(
        { provider, pending },
        { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI, extraAuthorizationParams: { code_challenge: "attacker-chosen" } },
      ),
    "OAUTH_INVALID_REQUEST",
  );
  assert.equal(error.message, "'code_challenge' is set by Tovu and cannot be overridden for this provider");
});

test("an extra authorization parameter the provider genuinely needs is carried through", () => {
  const { pending, provider } = makeFlow();

  const started = beginAuthorizationCode(
    { provider, pending },
    { ownerKey: "ws:higgs", client: TEST_CLIENT, redirectUri: REDIRECT_URI, extraAuthorizationParams: { audience: "https://api.example.com" } },
  );

  assert.equal(new URL(started.authorizationUrl).searchParams.get("audience"), "https://api.example.com");
});
