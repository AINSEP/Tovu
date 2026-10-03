import assert from "node:assert/strict";
import test from "node:test";

import { requestOAuthToken } from "@jini-ai/oauth";
import { createTestOAuthPorts, assertOAuthRejects, createFetchDouble, createTestClock, TEST_CLIENT } from "./helpers.js";

/**
 * @file Direct characterization tests for {@link requestOAuthToken}'s field-normalization branches.
 *
 * The higher-level grant tests (`authorization-code.test.ts`, `device-code.test.ts`) exercise this
 * function's error paths thoroughly but never happen to send a `token_type`-less or empty-string
 * response, nor an empty-string `refresh_token`. Pinned here before an internal-only refactor
 * (extraction only, no field-handling behavior changed).

 *
 * Design history from the retired Tovu token-endpoint module. The implementation now lives in
 * Jini/packages/oauth/src/token-endpoint.ts; these assertions retain its security argument.
 * @file The single POST every grant in this module ends at — authorization-code exchange, device-code
 * polling, and refresh all funnel through {@link requestOAuthToken}.
 *
 * One function rather than three because RFC 6749 §5.1/§5.2 defines ONE response shape and ONE
 * error shape for all of them, and three copies of that parser would be three places for a
 * `expires_in`-handling bug to hide. What differs between the grants is only the form body, which
 * the callers own.
 *
 * ## Bounded, and non-retrying, by construction
 *
 * - The request carries an `AbortSignal.timeout`. A slow or unreachable provider fails the
 *   operator's foreground action fast rather than hanging a spinner — the debate's Q3-e position,
 *   and the opposite of `mcp-federation/bootstrap.ts`'s deliberate boot-time fail-open, because
 *   nobody asked for a federated server at boot whereas somebody is watching this one.
 * - The response body is read through the BYTE-BOUNDED reader in `bounded-json.ts`. `response.json()`
 *   on a hostile or broken endpoint will happily buffer until the process dies; a token response is a
 *   few hundred bytes, so anything past the cap is a malformed response, not a big one.
 * - Redirects are refused. A 302 from a token endpoint would carry the client credentials in the
 *   form body to a host that was never validated.
 * - Nothing here retries. See `errors.ts` for why a code exchange is not safely repeatable.
 * The exact strings this endpoint's bounded read reports. Pinned by tests.
 * A human is waiting on this. Long enough for a slow but working provider, short enough that a
 *  dead one is reported while the operator still has the tab open.
 * Defaults to global `fetch`.
 * The grant-specific form body. `client_id`/`client_secret` are added here per `client.authMethod`.
 * Builds the form body and headers for `client.authMethod`. Kept separate so the three grants
 *  cannot each get client authentication subtly different.
 * The subset of RFC 6749 §5.1 this module consumes, after `JSON.parse` and before validation.
 * Turns an RFC 6749 §5.2 error body into an {@link OAuthError}.
 *
 * `error_description` is read for its `interval` sibling only and is never placed in `message`: it
 * is free text from a third party that this codebase renders into a browser and hands to a model.
 * The closed-vocabulary `error` code is preserved in `providerErrorCode` for logs.
 * RFC 6749 §5.1's `expires_in` is a relative lifetime; this module persists an absolute instant.
 *  A non-numeric or non-positive value yields `null` — "unknown expiry" — rather than a fabricated
 *  one, because a wrong `expiresAt` is worse than none: it schedules a refresh that will not help.
 * RFC 6749 §3.3: space-delimited. Providers also emit comma-delimited in the wild, so both split.
 * RFC 6749 §5.1's `refresh_token` is optional. A provider-sent empty string is treated the same as
 *  an absent one — `null`, never `""` — so callers have one falsy-but-present case to handle, not
 *  two. Split out of {@link requestOAuthToken} purely to keep that function's own branch count
 *  under the repo's complexity ceiling.
 * RFC 6749 §5.1's `token_type` is REQUIRED, but real providers omit or empty it. Defaulting to
 *  `"Bearer"` (the only type every grant here actually uses) matches the pre-extraction behavior
 *  exactly. Split out of {@link requestOAuthToken} for the same reason as
 *  {@link nonEmptyStringOrNull}.
 * Posts one grant to a token endpoint and normalizes the result.
 *
 * @param deps.clock - Supplies the instant `expiresAt` is computed from.
 * @param input.params - The grant-specific form fields; client authentication is added here.
 * @returns The normalized token set. `refreshToken` is `null` when the provider issued none.
 * @throws {OAuthError} `OAUTH_UNSAFE_ENDPOINT`, `OAUTH_PROVIDER_UNREACHABLE`,
 *   `OAUTH_MALFORMED_RESPONSE`, or whatever {@link toProviderError} maps the server's own error to.
 *   Every one of them is terminal except the two device-polling codes.
 * @complexity O(1) — one bounded outbound request, response capped at {@link MAX_OAUTH_RESPONSE_BYTES}.
 * A token endpoint that 302s would carry the client secret to an unvalidated host.
 * Checked before the status, because RFC 8628 §3.5's `authorization_pending` arrives as a 400
 * and is a normal, expected state rather than a failure.
 */

const TOKEN_ENDPOINT = "https://auth.example.com/token";

for (const authMethod of ["none", "client_secret_post", "client_secret_basic"] as const) {
  test(`token requests authenticate using ${authMethod}`, async () => {
    const http = createFetchDouble([{ json: { access_token: "at" } }]);
    const client = { clientId: "id: /+", clientSecret: "secret: /+", authMethod };
    await requestOAuthToken(
      {
        clock: createTestClock(),
        ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
        tokenEndpoint: TOKEN_ENDPOINT,
        client,
        params: { grant_type: "authorization_code", code: "c" },
      },
    );
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
    {
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "authorization_code" },
    },
  );

  assert.equal(tokens.tokenType, "Bearer");
});

test("an empty-string token_type defaults to Bearer rather than being passed through", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", token_type: "" } }]);

  const tokens = await requestOAuthToken(
    {
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "authorization_code" },
    },
  );

  assert.equal(tokens.tokenType, "Bearer");
});

test("a non-default token_type passes through unchanged", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", token_type: "mac" } }]);

  const tokens = await requestOAuthToken(
    {
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "authorization_code" },
    },
  );

  assert.equal(tokens.tokenType, "mac");
});

test("an empty-string refresh_token normalizes to null, same as an absent one", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", refresh_token: "" } }]);

  const tokens = await requestOAuthToken(
    {
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "authorization_code" },
    },
  );

  assert.equal(tokens.refreshToken, null);
});

test("a non-empty refresh_token passes through unchanged", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at", refresh_token: "rt-1" } }]);

  const tokens = await requestOAuthToken(
    {
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "authorization_code" },
    },
  );

  assert.equal(tokens.refreshToken, "rt-1");
});

test("HTTP 200 with authorization_pending remains a retryable provider error", async () => {
  const http = createFetchDouble([{ status: 200, json: { error: "authorization_pending", access_token: "must-not-win" } }]);
  const error = await assertOAuthRejects(() => requestOAuthToken(
    {
      clock: createTestClock(),
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "urn:ietf:params:oauth:grant-type:device_code" },
    },
  ), "OAUTH_AUTHORIZATION_PENDING");
  assert.equal(error.providerErrorCode, "authorization_pending");
  assert.equal(error.retryable, true);
  assert.equal(http.requests.length, 1);
});

test("HTTP 200 without an access_token is a malformed response", async () => {
  const http = createFetchDouble([{ json: { token_type: "Bearer" } }]);
  await assertOAuthRejects(() => requestOAuthToken(
    {
      clock: createTestClock(),
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "authorization_code" },
    },
  ), "OAUTH_MALFORMED_RESPONSE");
});

test("scope accepts comma and whitespace separators without empty scopes", async () => {
  const http = createFetchDouble([{ json: { access_token: "at", scope: "  read,write  profile,  email " } }]);
  const tokens = await requestOAuthToken(
    {
      clock: createTestClock(),
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      tokenEndpoint: TOKEN_ENDPOINT,
      client: TEST_CLIENT,
      params: { grant_type: "authorization_code" },
    },
  );
  assert.deepEqual(tokens.scopes, ["read", "write", "profile", "email"]);
});

for (const expiresIn of [0, -1, "abc"]) {
  test(`expires_in ${JSON.stringify(expiresIn)} yields unknown expiry`, async () => {
    const http = createFetchDouble([{ json: { access_token: "at", expires_in: expiresIn } }]);
    const tokens = await requestOAuthToken(
      {
        clock: createTestClock(),
        ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
        tokenEndpoint: TOKEN_ENDPOINT,
        client: TEST_CLIENT,
        params: { grant_type: "authorization_code" },
      },
    );
    assert.equal(tokens.expiresAt, null);
  });
}
