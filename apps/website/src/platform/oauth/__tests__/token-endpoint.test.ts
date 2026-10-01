import assert from "node:assert/strict";
import test from "node:test";

import { requestOAuthToken } from "../token-endpoint.js";
import { assertOAuthRejects, createFetchDouble, createTestClock, TEST_CLIENT } from "./helpers.js";

/**
 * @file Direct characterization tests for {@link requestOAuthToken}'s field-normalization branches.
 *
 * The higher-level grant tests (`authorization-code.test.ts`, `device-code.test.ts`) exercise this
 * function's error paths thoroughly but never happen to send a `token_type`-less or empty-string
 * response, nor an empty-string `refresh_token`. Pinned here before an internal-only refactor
 * (extraction only, no field-handling behavior changed).
 */

const TOKEN_ENDPOINT = "https://auth.example.com/token";

for (const authMethod of ["none", "client_secret_post", "client_secret_basic"] as const) {
  test(`token requests authenticate using ${authMethod}`, async () => {
    const http = createFetchDouble([{ json: { access_token: "at" } }]);
    const client = { clientId: "id: /+", clientSecret: "secret: /+", authMethod };
    await requestOAuthToken({ clock: createTestClock(), fetchFn: http.fetchFn },
      { tokenEndpoint: TOKEN_ENDPOINT, client, params: { grant_type: "authorization_code", code: "c" } });
    const request = http.requests[0];
    assert.equal(request.body.get("client_id"), authMethod === "client_secret_basic" ? null : client.clientId);
    assert.equal(request.body.get("client_secret"), authMethod === "client_secret_post" ? client.clientSecret : null);
    // Literal fixture pins URL encoding before the id/secret pair is base64 encoded.
    assert.equal(request.headers.authorization, authMethod === "client_secret_basic"
      ? `Basic ${Buffer.from("id%3A%20%2F%2B:secret%3A%20%2F%2B").toString("base64")}` : undefined);
  });
}

test("a missing token_type defaults to Bearer", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const tokens = await requestOAuthToken(
    { clock, fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } },
  );

  assert.equal(tokens.tokenType, "Bearer");
});

test("an empty-string token_type defaults to Bearer rather than being passed through", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", token_type: "" } }]);

  const tokens = await requestOAuthToken(
    { clock, fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } },
  );

  assert.equal(tokens.tokenType, "Bearer");
});

test("a non-default token_type passes through unchanged", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", token_type: "mac" } }]);

  const tokens = await requestOAuthToken(
    { clock, fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } },
  );

  assert.equal(tokens.tokenType, "mac");
});

test("an empty-string refresh_token normalizes to null, same as an absent one", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", refresh_token: "" } }]);

  const tokens = await requestOAuthToken(
    { clock, fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } },
  );

  assert.equal(tokens.refreshToken, null);
});

test("a non-empty refresh_token passes through unchanged", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", refresh_token: "rt-1" } }]);

  const tokens = await requestOAuthToken(
    { clock, fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } },
  );

  assert.equal(tokens.refreshToken, "rt-1");
});

test("HTTP 200 with authorization_pending remains a retryable provider error", async () => {
  const http = createFetchDouble([{ status: 200, json: { error: "authorization_pending", access_token: "must-not-win" } }]);
  const error = await assertOAuthRejects(() => requestOAuthToken(
    { clock: createTestClock(), fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "urn:ietf:params:oauth:grant-type:device_code" } },
  ), "OAUTH_AUTHORIZATION_PENDING");
  assert.equal(error.providerErrorCode, "authorization_pending");
  assert.equal(error.retryable, true);
  assert.equal(http.requests.length, 1);
});

test("HTTP 200 without an access_token is a malformed response", async () => {
  const http = createFetchDouble([{ json: { token_type: "Bearer" } }]);
  await assertOAuthRejects(() => requestOAuthToken(
    { clock: createTestClock(), fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } },
  ), "OAUTH_MALFORMED_RESPONSE");
});

test("scope accepts comma and whitespace separators without empty scopes", async () => {
  const http = createFetchDouble([{ json: { access_token: "at", scope: "  read,write  profile,  email " } }]);
  const tokens = await requestOAuthToken({ clock: createTestClock(), fetchFn: http.fetchFn },
    { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } });
  assert.deepEqual(tokens.scopes, ["read", "write", "profile", "email"]);
});

for (const expiresIn of [0, -1, "abc"]) {
  test(`expires_in ${JSON.stringify(expiresIn)} yields unknown expiry`, async () => {
    const http = createFetchDouble([{ json: { access_token: "at", expires_in: expiresIn } }]);
    const tokens = await requestOAuthToken({ clock: createTestClock(), fetchFn: http.fetchFn },
      { tokenEndpoint: TOKEN_ENDPOINT, client: TEST_CLIENT, params: { grant_type: "authorization_code" } });
    assert.equal(tokens.expiresAt, null);
  });
}
