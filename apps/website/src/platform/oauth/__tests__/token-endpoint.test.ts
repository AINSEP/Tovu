import assert from "node:assert/strict";
import test from "node:test";

import { requestOAuthToken } from "../token-endpoint.js";
import { createFetchDouble, createTestClock, TEST_CLIENT } from "./helpers.js";

/**
 * @file Direct characterization tests for {@link requestOAuthToken}'s field-normalization branches.
 *
 * The higher-level grant tests (`authorization-code.test.ts`, `device-code.test.ts`) exercise this
 * function's error paths thoroughly but never happen to send a `token_type`-less or empty-string
 * response, nor an empty-string `refresh_token`. Pinned here before an internal-only refactor
 * (extraction only, no field-handling behavior changed).
 */

const TOKEN_ENDPOINT = "https://auth.example.com/token";

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
