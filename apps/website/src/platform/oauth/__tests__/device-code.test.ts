import assert from "node:assert/strict";
import test from "node:test";

import { beginDeviceAuthorization, pollDeviceAuthorizationOnce } from "@jini-ai/oauth";
import { createTestOAuthPorts, assertOAuthRejects, createFetchDouble, createTestClock, TEST_CLIENT, TEST_PROVIDER } from "./helpers.js";

/**
 * @file The device authorization grant (RFC 8628) — the path a self-hosted install with no public
 * callback URL has to use.
 *
 * The assertions that matter: the two "keep polling" codes are the ONLY retryable outcomes, every
 * other outcome is terminal, one call means one poll (the module must not hide a loop), and the
 * provider-supplied `verification_uri` — which gets rendered to a human as a link — is validated
 * before it is handed back.

 *
 * Design history from the retired Tovu device-code module. The implementation now lives in
 * Jini/packages/oauth/src/device-code.ts; these assertions retain its security argument.
 * @file The Device Authorization Grant (RFC 8628) — a FIRST-CLASS path, not a fallback.
 *
 * Tovu is self-hosted. A large share of installs run behind a router, on a laptop, or on an
 * internal network with no publicly reachable callback URL, and for those the authorization-code
 * grant cannot work at all — there is nowhere for the provider to redirect to. The device grant
 * needs no callback route, no public origin, and no cross-origin return leg: the operator gets a
 * short code and a URL, opens it anywhere (including on their phone), and this process polls.
 *
 * It is also the only mechanism that is safe to surface inside a chat surface. Tovu's MCP-UI
 * surface is a sandboxed iframe whose return leg cannot carry an OAuth redirect, which is why an
 * in-chat authorization-code flow is rejected outright. A user code and a link have no return leg
 * to carry, so rendering them is not a boundary question.
 *
 * ## Polling is the one retryable thing in this module
 *
 * {@link pollDeviceAuthorizationOnce} performs exactly ONE poll and reports the outcome. It does
 * not loop, and it does not sleep. RFC 8628 §3.5's `authorization_pending` and `slow_down` come
 * back as `OAuthError` with `retryable: true` and a suggested interval; everything else is
 * terminal. Keeping the loop out of this module is what lets the caller decide whether polling is
 * driven by an admin UI's timer, by a route the browser calls, or by a test — and it keeps the
 * "never retry a terminal OAuth failure" rule enforceable in one place instead of hidden inside a
 * loop's catch block.
 * RFC 8628 §3.2 default when the server sends no `interval`.
 * A server asking us to poll less often than this is treated as asking for the ceiling. Bounds the
 *  worst case where a hostile or broken server returns an enormous interval and wedges the flow.
 * Ceiling on `expires_in` for the device code itself, in case a server omits or inflates it.
 * Tighter than the module-wide cap: a device-authorization response is a handful of short fields,
 *  so a body an order of magnitude larger is already not one.
 * One started device authorization. `deviceCode` is the secret half; everything else is safe to
 *  render to an operator.
 * SECRET. Sent on every poll, never rendered, never logged.
 * The short code the operator types on the provider's page.
 * Where the operator goes. Validated by {@link assertSafeUserFacingUrl} before it is returned.
 * RFC 8628 §3.2's optional pre-filled variant, or `null`. Also safety-validated.
 * Seconds the caller should wait between polls, already clamped.
 * Clamps a server-supplied seconds value into `[min, max]`, defaulting a non-numeric one.
 * @throws {OAuthError} `OAUTH_UNSUPPORTED_GRANT` when the descriptor declares no device endpoint.
 *  @returns The endpoint, narrowed to a defined string for the caller.
 * The RFC 8628 §3.1 request body.
 * @throws {OAuthError} `OAUTH_PROVIDER_UNREACHABLE` on a timeout or transport failure — bounded,
 *  never retried.
 * @throws {OAuthError} `OAUTH_PROVIDER_REJECTED` (or the mapped provider code) when the server
 *  refused the request — a non-2xx status, an `error` field, or both.
 * Narrows an already-accepted RFC 8628 §3.2 response body into a {@link DeviceAuthorization}.
 *  @throws {OAuthError} `OAUTH_MALFORMED_RESPONSE` on a missing required field,
 *  `OAUTH_UNSAFE_ENDPOINT` when the server's own `verification_uri` fails the user-facing-link check.
 * `verification_url` is Google's long-standing pre-RFC spelling and is still emitted by several
 * providers; accepted because silently dropping it would fail with a confusing "missing field".
 * Starts a device authorization (RFC 8628 §3.1–3.2).
 *
 * @returns The user code, verification URL, poll interval, and the secret device code.
 * @throws {OAuthError} `OAUTH_UNSUPPORTED_GRANT` when the descriptor declares no device endpoint,
 *   `OAUTH_PROVIDER_UNREACHABLE` on a timeout or transport failure (bounded, never retried),
 *   `OAUTH_MALFORMED_RESPONSE` on a non-compliant body, `OAUTH_UNSAFE_ENDPOINT` when the server's
 *   own `verification_uri` fails the user-facing-link check.
 * @complexity O(1) — one bounded outbound request.
 * The authorization's own deadline, from {@link DeviceAuthorization.expiresAt}. Checked locally
 *  so an abandoned flow stops costing outbound requests even if the provider keeps answering.
 * Performs ONE poll of the token endpoint for a device authorization (RFC 8628 §3.4).
 *
 * Does not loop and does not sleep — see this file's header for why the loop belongs to the caller.
 *
 * @returns The token set once the operator has approved.
 * @throws {OAuthError} `retryable: true` for `OAUTH_AUTHORIZATION_PENDING` and `OAUTH_SLOW_DOWN`
 *   (with `retryAfterSeconds` when the server supplied one); terminal for `OAUTH_EXPIRED_TOKEN`,
 *   `OAUTH_ACCESS_DENIED`, and everything {@link requestOAuthToken} raises.
 * @complexity O(1) — one bounded outbound request, or none when already expired.
 * The exact strings this endpoint's bounded read reports. Pinned by tests.
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

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT });

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

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT });

  assert.equal(started.verificationUri, "https://auth.example.com/activate");
});

for (const field of ["device_code", "user_code"] as const) {
  for (const value of [undefined, "", null, 42]) {
    test(`begin refuses ${field}=${String(value)} instead of returning an unusable authorization`, async () => {
      const http = createFetchDouble([{ json: { ...DEVICE_RESPONSE, [field]: value } }]);
      const error = await assertOAuthRejects(
        () => beginDeviceAuthorization({ provider: TEST_PROVIDER, clock: createTestClock(), ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT }),
        "OAUTH_MALFORMED_RESPONSE",
      );
      assert.equal(error.message, `the device authorization response is missing '${field}'`);
    });
  }
}

for (const [expiresIn, expiresAt] of [
  [999999, "2026-08-25T12:30:00.000Z"],
  [1, "2026-08-25T12:00:30.000Z"],
] as const) {
  test(`begin clamps expires_in=${expiresIn} to a bounded local deadline`, async () => {
    const http = createFetchDouble([{ json: { ...DEVICE_RESPONSE, expires_in: expiresIn } }]);
    const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock: createTestClock(), ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT });
    assert.equal(started.expiresAt, expiresAt);
  });
}

for (const completeUri of [
  "javascript:alert(1)",
  "http://auth.example.com/activate?user_code=WDJB-MJHT",
  "https://user:secret@auth.example.com/activate?user_code=WDJB-MJHT",
]) {
  test(`begin refuses an unsafe prefilled verification link: ${completeUri}`, async () => {
    const http = createFetchDouble([{ json: { ...DEVICE_RESPONSE, verification_uri_complete: completeUri } }]);
    await assertOAuthRejects(
      () => beginDeviceAuthorization({ provider: TEST_PROVIDER, clock: createTestClock(), ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT }),
      "OAUTH_UNSAFE_ENDPOINT",
    );
  });
}

test("a javascript: verification URI is refused — it would be rendered to an operator as a link", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { ...DEVICE_RESPONSE, verification_uri: "javascript:alert(1)", verification_uri_complete: null } }]);

  const error = await assertOAuthRejects(
    () => beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT }),
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
    () => beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT }),
    "OAUTH_UNSAFE_ENDPOINT",
  );
  assert.equal(error.message, "provider-supplied link embeds credentials in the URL");
});

test("a hostile poll interval is clamped rather than wedging the flow", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ json: { ...DEVICE_RESPONSE, interval: 86_400 } }]);

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT });

  assert.equal(started.intervalSeconds, 60);
});

test("a missing interval falls back to RFC 8628's default of 5 seconds", async () => {
  const clock = createTestClock();
  const { interval: _dropped, ...withoutInterval } = DEVICE_RESPONSE;
  const http = createFetchDouble([{ json: withoutInterval }]);

  const started = await beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT });

  assert.equal(started.intervalSeconds, 5);
});

test("a provider that declares no device endpoint refuses the grant instead of guessing a URL", async () => {
  const clock = createTestClock();
  const provider = { ...TEST_PROVIDER, supportedGrants: ["authorization_code"] as const, deviceAuthorizationEndpoint: undefined };
  const http = createFetchDouble([{ json: DEVICE_RESPONSE }]);

  const error = await assertOAuthRejects(
    () => beginDeviceAuthorization({ provider, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT }),
    "OAUTH_UNSUPPORTED_GRANT",
  );
  assert.equal(error.message, "provider 'test-provider' does not support the device grant");
  assert.equal(http.callCount(), 0);
});

test("an HTTP-level rejection with no provider error code still surfaces as OAUTH_PROVIDER_REJECTED", async () => {
  // Pins the `!response.ok || typeof body.error === "string"` branch's non-error-field half
  // before it moves into its own function.
  const clock = createTestClock();
  const http = createFetchDouble([{ status: 400, json: { message: "bad request" } }]);

  const error = await assertOAuthRejects(
    () => beginDeviceAuthorization({ provider: TEST_PROVIDER, clock, ...createTestOAuthPorts({ fetchFn: http.fetchFn }), client: TEST_CLIENT }),
    "OAUTH_PROVIDER_REJECTED",
  );
  assert.equal(error.message, "the authorization server refused the device authorization request (HTTP 400)");
  assert.equal(error.providerErrorCode, undefined);
});

test("authorization_pending is the retryable outcome, and one call is one poll", async () => {
  const clock = createTestClock();
  const http = createFetchDouble([{ status: 400, json: { error: "authorization_pending" } }]);

  const error = await assertOAuthRejects(
    () =>
      pollDeviceAuthorizationOnce(
        {
          provider: TEST_PROVIDER,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          client: TEST_CLIENT,
          deviceCode: "dev-code-secret",
          expiresAt: "2026-08-25T12:15:00.000Z",
        },
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
        {
          provider: TEST_PROVIDER,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          client: TEST_CLIENT,
          deviceCode: "dev-code-secret",
          expiresAt: "2026-08-25T12:15:00.000Z",
        },
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
        {
          provider: TEST_PROVIDER,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          client: TEST_CLIENT,
          deviceCode: "dev-code-secret",
          expiresAt: "2026-08-25T12:15:00.000Z",
        },
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
        {
          provider: TEST_PROVIDER,
          clock,
          ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
          client: TEST_CLIENT,
          deviceCode: "dev-code-secret",
          expiresAt: "2026-08-25T12:15:00.000Z",
        },
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
    {
      provider: TEST_PROVIDER,
      clock,
      ...createTestOAuthPorts({ fetchFn: http.fetchFn }),
      client: TEST_CLIENT,
      deviceCode: "dev-code-secret",
      expiresAt: "2026-08-25T12:15:00.000Z",
    },
  );

  assert.equal(tokens.accessToken, "at-1");
  assert.equal(tokens.refreshToken, "rt-1");
  const pollRequest = http.requests[0];
  assert.ok(pollRequest);
  assert.equal(pollRequest.body.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
  assert.equal(pollRequest.body.get("device_code"), "dev-code-secret");
});
