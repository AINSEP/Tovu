import assert from "node:assert/strict";
import test from "node:test";

import { beginDeviceAuthorization, pollDeviceAuthorizationOnce } from "../device-code.js";
import { assertOAuthRejects, createFetchDouble, createTestClock, TEST_CLIENT, TEST_PROVIDER } from "./helpers.js";

/**
 * @file The device authorization grant (RFC 8628) — the path a self-hosted install with no public
 * callback URL has to use.
 *
 * The assertions that matter: the two "keep polling" codes are the ONLY retryable outcomes, every
 * other outcome is terminal, one call means one poll (the module must not hide a loop), and the
 * provider-supplied `verification_uri` — which gets rendered to a human as a link — is validated
 * before it is handed back.
 */

const DEVICE_RESPONSE = {
  device_code: "dev-code-secret",
  user_code: "WDJB-MJHT",
  verification_uri: "https://auth.example.com/activate",
  verification_uri_complete: "https://auth.example.com/activate?user_code=WDJB-MJHT",
  expires_in: 900,
  interval: 5,
};

test("begin returns the user-facing code and URL plus the secret device code", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: DEVICE_RESPONSE }]);

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn }, { client: TEST_CLIENT });

  assert.deepEqual(started, {
    deviceCode: "dev-code-secret",
    userCode: "WDJB-MJHT",
    verificationUri: "https://auth.example.com/activate",
    verificationUriComplete: "https://auth.example.com/activate?user_code=WDJB-MJHT",
    expiresAt: "2026-08-25T12:15:00.000Z",
    intervalSeconds: 5,
  });
  const startedRequest = http.requests[0];
  assert.ok(startedRequest);
  assert.equal(startedRequest.url, "https://auth.example.com/device");
  assert.equal(startedRequest.body.get("scope"), "images:generate");
});

test("Google's pre-RFC `verification_url` spelling is accepted rather than reported as missing", async () => {
  const clock = createTestClock();
  const { verification_uri: _dropped, ...withoutUri } = DEVICE_RESPONSE;
  const http = createFetchDouble([{ json: { ...withoutUri, verification_url: "https://auth.example.com/activate" } }]);

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn }, { client: TEST_CLIENT });

  assert.equal(started.verificationUri, "https://auth.example.com/activate");
});

test("a javascript: verification URI is refused — it would be rendered to an operator as a link", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { ...DEVICE_RESPONSE, verification_uri: "javascript:alert(1)", verification_uri_complete: null } }]);

  const error = await assertOAuthRejects(
    () => beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn }, { client: TEST_CLIENT }),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "provider-supplied link must use https (http is permitted only for loopback)");
});

test("a verification URI embedding credentials is refused", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([
    { json: { ...DEVICE_RESPONSE, verification_uri: "https://auth.example.com@evil.example.net/activate", verification_uri_complete: null } },
  ]);

  const error = await assertOAuthRejects(
    () => beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn }, { client: TEST_CLIENT }),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "provider-supplied link embeds credentials in the URL");
});

test("a hostile poll interval is clamped rather than wedging the flow", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { ...DEVICE_RESPONSE, interval: 86_400 } }]);

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn }, { client: TEST_CLIENT });

  assert.equal(started.intervalSeconds, 60);
});

test("a missing interval falls back to RFC 8628's default of 5 seconds", async () => {
  const clock = createTestClock();
  const { interval: _dropped, ...withoutInterval } = DEVICE_RESPONSE;
  const http = createFetchDouble([{ json: withoutInterval }]);

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn }, { client: TEST_CLIENT });

  assert.equal(started.intervalSeconds, 5);
});

test("a provider that declares no device endpoint refuses the grant instead of guessing a URL", async () => {
  const clock = createTestClock();
  const provider = { ...TEST_PROVIDER, supportedGrants: ["authorization_code"] as const, deviceAuthorizationEndpoint: undefined };
  const http = createFetchDouble([{ json: DEVICE_RESPONSE }]);

  const error = await assertOAuthRejects(
    () => beginDeviceAuthorization({ provider, clock, fetchFn: http.fetchFn }, { client: TEST_CLIENT }),
    "OAUTH_UNSUPPORTED_GRANT",
  );
  assert.equal(error.message, "provider 'test-provider' does not support the device grant");
  assert.equal(http.callCount(), 0);
});

test("authorization_pending is the retryable outcome, and one call is one poll", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ status: 400, json: { error: "authorization_pending" } }]);

  const error = await assertOAuthRejects(
    () =>
      pollDeviceAuthorizationOnce(
        { provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn },
        { client: TEST_CLIENT, deviceCode: "dev-code-secret", expiresAt: "2026-08-25T12:15:00.000Z" },
      ),
    "OAUTH_AUTHORIZATION_PENDING",
  );

  assert.equal(error.retryable, true);
  assert.equal(http.callCount(), 1, "pollDeviceAuthorizationOnce must not loop internally");
});

test("slow_down is retryable and carries the interval the server asked for", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ status: 400, json: { error: "slow_down", interval: 10 } }]);

  const error = await assertOAuthRejects(
    () =>
      pollDeviceAuthorizationOnce(
        { provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn },
        { client: TEST_CLIENT, deviceCode: "dev-code-secret", expiresAt: "2026-08-25T12:15:00.000Z" },
      ),
    "OAUTH_SLOW_DOWN",
  );

  assert.equal(error.retryable, true);
  assert.equal(error.retryAfterSeconds, 10);
});

test("access_denied ends the flow — the operator said no, retrying would just re-ask", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ status: 400, json: { error: "access_denied" } }]);

  const error = await assertOAuthRejects(
    () =>
      pollDeviceAuthorizationOnce(
        { provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn },
        { client: TEST_CLIENT, deviceCode: "dev-code-secret", expiresAt: "2026-08-25T12:15:00.000Z" },
      ),
    "OAUTH_ACCESS_DENIED",
  );
  assert.equal(error.retryable, false);
});

test("an expired device authorization is detected locally and costs no outbound request", async () => {
  const clock = createTestClock();
  clock.advance(16 * 60 * 1000);
  const http = createFetchDouble([{ json: { access_token: "at" } }]);

  const error = await assertOAuthRejects(
    () =>
      pollDeviceAuthorizationOnce(
        { provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn },
        { client: TEST_CLIENT, deviceCode: "dev-code-secret", expiresAt: "2026-08-25T12:15:00.000Z" },
      ),
    "OAUTH_EXPIRED_TOKEN",
  );

  assert.equal(error.retryable, false);
  assert.equal(error.message, "the device authorization expired before it was approved");
  assert.equal(http.callCount(), 0);
});

test("an approved poll returns the token set with the RFC 8628 grant type on the wire", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }]);

  const tokens = await pollDeviceAuthorizationOnce(
    { provider: TEST_PROVIDER, clock, fetchFn: http.fetchFn },
    { client: TEST_CLIENT, deviceCode: "dev-code-secret", expiresAt: "2026-08-25T12:15:00.000Z" },
  );

  assert.equal(tokens.accessToken, "at-1");
  assert.equal(tokens.refreshToken, "rt-1");
  const pollRequest = http.requests[0];
  assert.ok(pollRequest);
  assert.equal(pollRequest.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
  assert.equal(pollRequest.body.get("device_code"), "dev-code-secret");
});
